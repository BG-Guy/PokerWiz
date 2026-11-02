// Bankroll insights: the downswing you're in (or not), month to month, how much you've played, an honest
// "is it normal?" check of your downswing against your own win rate and swings, and a short line of
// encouragement. Pure functions; sessions come in as cash games converted for display (sessionsForDisplay).
import { sessionProfit } from './stats.js';
import { bankrollSeries, currentDrawdown, downswings, monthToMonth, sessionsPerWeek } from './bankroll.js';
import { createRandom } from '../coach/random.js';
import { formatUnits } from './format.js';

// Below this much data the "is it normal?" check says it needs more sessions instead of guessing.
export const MIN_SESSIONS = 10;
export const MIN_HOURS = 30;
// The simulation uses a fixed seed, so the same sessions always give the same answer.
const SEED = 20260101;

const hoursOf = (s) => s.durationMin / 60;
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

// Where you stand against your peak. inDownswing: more than half a typical session below the best point
// (a few big blinds under it still counts as "at your peak").
export function downswingStatus(sessions) {
  const now = currentDrawdown(bankrollSeries(sessions));
  if (!now) return null;
  const typicalSession = mean(sessions.map((s) => Math.abs(sessionProfit(s))));
  return { ...now, typicalSession, inDownswing: now.below > 0 && now.below > typicalSession * 0.5 };
}

// Win rate and swings per hour, from session results. Each session's result is treated as the win rate times
// its hours plus noise that grows with the square root of its length, so the per-hour standard deviation is
// sd^2 = sum((result - winRate * hours)^2 / hours) / (n - 1). Sessions under 15 minutes are left out.
export function hourlyVariance(sessions) {
  const usable = sessions.filter((s) => s.durationMin >= 15);
  const hours = usable.reduce((total, s) => total + hoursOf(s), 0);
  if (usable.length < 2 || hours <= 0) return null;
  const winRate = usable.reduce((total, s) => total + sessionProfit(s), 0) / hours;
  const squares = usable.reduce((total, s) => total + (sessionProfit(s) - winRate * hoursOf(s)) ** 2 / hoursOf(s), 0);
  return { winRate, sd: Math.sqrt(squares / (usable.length - 1)), sessions: usable.length, hours };
}

// Standard normal numbers from a seeded uniform source (Box-Muller).
function normalSource(random) {
  return () => {
    const u = 1 - random(); // (0, 1], safe for the log
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
}

// Monte Carlo: many players with exactly this win rate and standard deviation (per hour) each play `hours`
// hours, as a random walk with drift in steps of about an hour (at most 400 steps). Returns each player's
// deepest downswing, smallest first.
export function simulateWorstDownswings({ winRate, sd, hours, runs = 2000, seed = SEED }) {
  const steps = Math.min(400, Math.max(20, Math.round(hours)));
  const dt = hours / steps;
  const drift = winRate * dt;
  const spread = sd * Math.sqrt(dt);
  const normal = normalSource(createRandom(seed));
  const worst = new Float64Array(runs);
  for (let run = 0; run < runs; run++) {
    let bankroll = 0;
    let peak = 0;
    let deepest = 0;
    for (let step = 0; step < steps; step++) {
      bankroll += drift + spread * normal();
      if (bankroll > peak) peak = bankroll;
      else if (peak - bankroll > deepest) deepest = peak - bankroll;
    }
    worst[run] = deepest;
  }
  return worst.sort();
}

// Share of the simulated players whose deepest downswing reached at least `depth`.
export function chanceOfDownswing(worst, depth) {
  let count = 0;
  for (const value of worst) if (value >= depth) count++;
  return count / worst.length;
}

// "About 34 in 100", "Fewer than 1 in 100", "Almost all".
export function chanceInWords(chance) {
  if (chance >= 0.985) return 'Almost all';
  if (chance < 0.01) return 'Fewer than 1 in 100';
  return `About ${Math.round(chance * 100)} in 100`;
}

const VERDICTS = [
  { min: 0.3, status: 'common', label: 'Very normal' },
  { min: 0.1, status: 'normal', label: 'Normal' },
  { min: 0.02, status: 'rare', label: 'Rough, but it happens' },
  { min: 0, status: 'unusual', label: 'Unusual' },
];

// Is the downswing normal for your numbers? Tests your current downswing (or, at a peak, your biggest one) by
// asking how many simulated players with your win rate and swings see one at least this deep over the hours
// you've played. Statuses: 'not-enough' (too little data), 'none' (never far below a peak), or a verdict.
export function varianceCheck(sessions, { runs = 2000 } = {}) {
  const stats = hourlyVariance(sessions);
  if (!stats || stats.sessions < MIN_SESSIONS || stats.hours < MIN_HOURS) {
    return {
      status: 'not-enough',
      label: 'Too early to tell',
      sessionsNeeded: Math.max(0, MIN_SESSIONS - (stats?.sessions ?? 0)),
      hoursNeeded: Math.max(0, Math.ceil(MIN_HOURS - (stats?.hours ?? 0))),
      sentence: `Play at least ${MIN_SESSIONS} sessions and ${MIN_HOURS} hours, and this check will tell you how normal your swings are.`,
    };
  }

  // The downswing to test: the one you're in, otherwise the biggest you've had.
  const status = downswingStatus(sessions);
  const largest = downswings(bankrollSeries(sessions))[0];
  const which = status.inDownswing ? 'current' : 'largest';
  const depth = status.inDownswing ? status.worst : largest?.depth ?? 0;
  if (!(depth > status.typicalSession * 0.5) || stats.sd <= 0) {
    return { status: 'none', label: 'Smooth so far', ...stats, sentence: "You haven't had a real downswing yet. When one comes, this check will put it in context." };
  }

  // Simulate players with your numbers over the hours you've played.
  const worst = simulateWorstDownswings({ ...stats, runs });
  const chance = chanceOfDownswing(worst, depth);
  const verdict = VERDICTS.find((v) => chance >= v.min);
  const typicalWorst = worst[Math.floor(worst.length / 2)];
  const roughWorst = worst[Math.floor(worst.length * 0.9)];
  const hoursText = `${Math.round(stats.hours)} hours`;
  const depthText = formatUnits(-depth, { whole: true });
  const subject = which === 'current' ? `a downswing as deep as this one (${depthText} at its worst)` : `a downswing as deep as your biggest (${depthText})`;

  return {
    ...stats,
    status: verdict.status,
    label: verdict.label,
    which,
    depth,
    chance,
    typicalWorst,
    roughWorst,
    runs,
    sentence: `${chanceInWords(chance)} players with your win rate and swings see ${subject} over ${hoursText}.`,
    meaning: meaningOf(verdict.status, stats),
  };
}

// What the verdict means, in plain words, without claiming more than the numbers can say.
function meaningOf(status, { winRate, hours }) {
  const lines = {
    common: 'This is part of the game at your numbers. Nothing here says your play got worse.',
    normal: 'Painful, but well within what your numbers produce. Keep playing your game.',
    rare: "It's on the rough side for your numbers, but it happens. A calm look at your recent big hands is worth it; overreacting isn't.",
    unusual:
      "That's deeper than your numbers usually produce. It can still be bad luck, but your real win rate may be lower than your results so far suggest, so review your recent sessions.",
  };
  const notes = [lines[status]];
  if (winRate <= 0) notes.push('Your results so far are at or below break-even, and at that rate long downswings are expected until the win rate turns.');
  if (hours < 200) notes.push(`Your win rate comes from ${Math.round(hours)} hours, which is a small sample: the true number could be quite different.`);
  return notes;
}

// Short lines of encouragement, written for this app (no borrowed quotes), grouped by how things are going.
export const PEP_LINES = {
  downswing: [
    'Every winning graph has valleys in it. This is one of yours, not the end of the story.',
    "You can't choose the cards, only the decisions. Keep the decisions good and the cards will even out.",
    'Judge the play, not the result. Good play is the only thing that pays over thousands of hands.',
    'Downswings are the price of a game where you have an edge. Pay it calmly, then go collect.',
    'Shorter sessions, softer tables, clear head. The swing turns when it turns, and you want to be ready.',
  ],
  peak: [
    'Running good feels great. Playing well is what keeps the graph pointing up.',
    'Bank the wins and keep the routine. Your edge is the same as it was on a losing day.',
    'Enjoy the heater, and keep your stop-loss anyway.',
  ],
  steady: [
    'Variance is loud, edges are quiet. Keep showing up and let the hours do the talking.',
    'A steady head beats a hot streak. Keep stacking good sessions.',
  ],
  early: ['Every big sample starts with a few sessions. Keep logging and the picture gets sharper.'],
};

// One line that fits the moment. Picked by session count, so it stays the same until you play again.
export function pepTalk(sessions, status = downswingStatus(sessions)) {
  const mood = sessions.length < MIN_SESSIONS ? 'early' : status?.inDownswing ? 'downswing' : status && status.below === 0 ? 'peak' : 'steady';
  const lines = PEP_LINES[mood];
  return { mood, text: lines[sessions.length % lines.length] };
}

// Everything the bankroll insight cards show, in one pass.
export function bankrollInsights(sessions) {
  const hours = sessions.reduce((total, s) => total + hoursOf(s), 0);
  const status = downswingStatus(sessions);
  const months = monthToMonth(sessions);
  return {
    downswing: status,
    months,
    played: {
      sessions: sessions.length,
      hours,
      perWeek: sessionsPerWeek(sessions),
      averageHours: sessions.length ? hours / sessions.length : 0,
      longestHours: Math.max(0, ...sessions.map(hoursOf)),
    },
    normal: varianceCheck(sessions),
    pep: pepTalk(sessions, status),
  };
}
