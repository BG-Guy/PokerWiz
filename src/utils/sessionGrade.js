// A session's grade (Game History): one letter from three parts, each scored 0-100.
//   Decisions   how well you played the hands you saved from it: the coach's accuracy for the hands you had it
//               review, or your own star ratings when none were reviewed (half the grade).
//   Results     money won: big blinds per hour in cash games, return on the buy-in in tournaments (30%).
//   Time        hours played: 2 to 7 hours scores best; a short session is a small sample, and play past 7 hours
//               tends to suffer from fatigue (20%).
// Without saved hands the grade comes from results and time alone (60/40), and says so.
import { isTournament, sessionProfit } from './stats.js';

const WEIGHTS = { decisions: 0.5, results: 0.3, time: 0.2 };
export const LETTERS = [
  [85, 'A', 'Excellent'],
  [70, 'B', 'Good'],
  [55, 'C', 'OK'],
  [40, 'D', 'Rough'],
  [0, 'F', 'Poor'],
];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x) => Math.round(x);

// Results: 50 at break-even, toward 100 for a big win, toward 0 for a big loss (+15 bb/h is about 88).
function resultsPart(session) {
  const profit = sessionProfit(session);
  if (isTournament(session)) {
    const roi = profit / Math.max(1, session.buyIn + (session.expenses ?? 0));
    return { score: round(50 + 50 * Math.tanh(roi)), detail: `${roi >= 0 ? '+' : ''}${Math.round(roi * 100)}% on the buy-in` };
  }
  const hours = Math.max(session.durationMin / 60, 0.25);
  const perHour = session.bigBlind > 0 ? profit / session.bigBlind / hours : 0;
  return { score: round(50 + 50 * Math.tanh(perHour / 15)), detail: `${perHour >= 0 ? '+' : ''}${perHour.toFixed(1)} bb an hour` };
}

// Time: 30 for a few minutes, 90 at 2 hours, 100 from 3 to 7 hours, easing to 70 by 12 hours.
function timePart(session) {
  const hours = session.durationMin / 60;
  let score;
  if (hours <= 0.5) score = 30;
  else if (hours < 2) score = 30 + ((hours - 0.5) / 1.5) * 60;
  else if (hours < 3) score = 90 + (hours - 2) * 10;
  else if (hours <= 7) score = 100;
  else score = 100 - clamp((hours - 7) / 5, 0, 1) * 30;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return { score: round(score), detail: `${h > 0 ? `${h}h ` : ''}${m}m played` };
}

// Decisions: the coach's accuracy where you had hands reviewed, else your star ratings (x 20), else nothing.
function decisionsPart(hands) {
  const reviewed = hands.filter((h) => typeof h.coachAccuracy === 'number');
  if (reviewed.length) {
    const avg = reviewed.reduce((sum, h) => sum + h.coachAccuracy, 0) / reviewed.length;
    return { score: round(avg), detail: `Coach accuracy over ${reviewed.length} reviewed ${reviewed.length === 1 ? 'hand' : 'hands'}` };
  }
  const rated = hands.filter((h) => typeof h.rating === 'number');
  if (rated.length) {
    const avg = rated.reduce((sum, h) => sum + h.rating, 0) / rated.length;
    return { score: round(avg * 20), detail: `Your rating of ${rated.length} saved ${rated.length === 1 ? 'hand' : 'hands'} (none reviewed by the coach yet)` };
  }
  return null;
}

export function letterOf(score) {
  const [, letter, label] = LETTERS.find(([min]) => score >= min);
  return { letter, label };
}

// session: the saved session (amounts in dollars); hands: the hands saved from it.
// Returns { score, letter, label, parts: [{ key, name, score, weight, detail }], note }.
export function gradeSession(session, hands = []) {
  const decisions = decisionsPart(hands);
  const parts = [
    decisions && { key: 'decisions', name: 'Decisions', ...decisions },
    { key: 'results', name: 'Results', ...resultsPart(session) },
    { key: 'time', name: 'Time played', ...timePart(session) },
  ].filter(Boolean);
  const weights = decisions ? WEIGHTS : { results: 0.6, time: 0.4 };
  for (const part of parts) part.weight = weights[part.key];
  const score = round(parts.reduce((sum, p) => sum + p.score * p.weight, 0));
  return {
    score,
    ...letterOf(score),
    parts,
    note: decisions ? null : 'No saved hands from this session, so the grade is results and time only. Save hands and review them with the Coach to grade your decisions.',
  };
}
