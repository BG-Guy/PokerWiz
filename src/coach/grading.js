// Turning decisions into accuracy scores and chess-style labels, against the GTO solution (gto/).
//
// A decision's EV loss is measured against the pot at that moment (losing 10% of the pot is a real mistake,
// $3 in a $600 pot is noise) and in big blinds (a 10 bb leak matters even in a huge pot).
// Everyone is graded the same way, against GTO: only solver noise (half a percent of the pot) is forgiven,
// whatever the player's level.
// GTO mixes its plays, so how often it takes your option counts too (gradeAgainstGto), as long as the solve
// agrees that it costs next to nothing.

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// EV loss (in chips) -> score 0..100. Losses count both relative to the pot (how wrong the decision was)
// and in big blinds (how much it actually cost). As a share of a 20 bb pot: 3% scores about 87 (Good), 5%
// about 77 and 10% about 58 (Inaccuracy), 20% about 32 (Mistake), 30% or more is a Blunder. Each big blind
// given up takes about 3% more off, so the same share of a bigger pot scores lower.
const NOISE = 0.005; // share of the pot that's solver noise, not a mistake
const PER_POT = 5.2;
const PER_BB = 0.03;
export function scoreFromLoss(evLoss, potRef, bb = 1) {
  const counted = Math.max(0, evLoss - NOISE * potRef);
  const relative = (PER_POT * counted) / Math.max(potRef, 1e-9);
  const absolute = (PER_BB * counted) / Math.max(bb, 1e-9);
  return Math.round(100 * Math.exp(-relative - absolute));
}

// GTO mixes: an option it takes at least MIXED_BEST of the time with your hand is as good as the best one (at
// equilibrium every option it mixes is worth the same), and one it takes at least MIXED_GOOD of the time is
// "Good". Only when the solve agrees it costs next to nothing (the share of the pot in the _LOSS limits): a
// quick solve isn't fully converged, and its rarer mixes can hide a real loss.
export const MIXED_BEST = 0.2;
export const MIXED_GOOD = 0.05;
const MIXED_BEST_LOSS = 0.015;
const MIXED_GOOD_LOSS = 0.03;
// Postflop, a play GTO (almost) never makes is at most an Inaccuracy once it gives up more than this share of
// the pot; below it, it can still be "Good".
const RARE_PLAY_LOSS = 0.02;

// Grade a decision against the GTO advice (gto/hand.js). advice.options: [{ frequency, ev (chips vs folding,
// postflop) }], advice.lossBB (preflop: bb worse than the best option). Returns { best, evLoss (chips), score }.
export function gradeAgainstGto({ advice, actual, potRef, bb }) {
  const options = advice.options;
  const loss = (k) => (advice.lossBB ? advice.lossBB[k] * bb : Math.max(0, Math.max(...options.map((o) => o.ev ?? -Infinity)) - (options[k].ev ?? 0)));
  const hasValues = advice.lossBB || options.every((o) => o.ev !== null && o.ev !== undefined);
  // Best: the most valuable option (ties go to the one GTO plays most), or the most played when values are missing.
  let best = 0;
  for (let k = 1; k < options.length; k++) {
    const better = hasValues ? loss(k) < loss(best) - 1e-9 || (Math.abs(loss(k) - loss(best)) <= 1e-9 && options[k].frequency > options[best].frequency) : options[k].frequency > options[best].frequency;
    if (better) best = k;
  }
  const frequency = options[actual]?.frequency ?? 0;
  // How often GTO takes the same kind of play (any bet or raise size counts as one kind).
  const kindOf = (o) => (o.type === 'bet' || o.type === 'raise' || o.type === 'allin' ? 'aggressive' : o.type);
  const kindFrequency = actual < 0 ? 0 : options.filter((o) => kindOf(o) === kindOf(options[actual])).reduce((sum, o) => sum + o.frequency, 0);
  const evLoss = actual < 0 ? 0 : hasValues ? Math.max(0, loss(actual) - loss(best)) : 0;
  const lossShare = evLoss / Math.max(potRef, 1e-9);
  let score = actual === best ? 100 : hasValues ? scoreFromLoss(evLoss, potRef, bb) : Math.round(100 * Math.min(1, frequency / MIXED_BEST));
  if (frequency >= MIXED_BEST && lossShare <= MIXED_BEST_LOSS) score = 100;
  else if (frequency >= MIXED_GOOD && lossShare <= MIXED_GOOD_LOSS) score = Math.min(96, Math.max(score, 85));
  else if (actual !== best && advice.lossBB) {
    // Preflop values are stored coarsely (tiny differences round to zero), so an option GTO (almost) never
    // takes is capped below "Good" however close its value looks.
    score = Math.min(score, Math.round(60 + 400 * frequency));
  } else if (actual !== best) {
    // Postflop: a play GTO doesn't make is never "Best", however close in value, and past a small cost it's at
    // most an Inaccuracy. The right kind of play in a size GTO rarely uses is still "Good" when it costs little.
    score = Math.min(score, 96);
    if (frequency < MIXED_GOOD && lossShare > RARE_PLAY_LOSS) score = Math.min(score, 79);
    if (kindFrequency >= 0.5 && lossShare <= RARE_PLAY_LOSS) score = Math.max(score, 85);
  }
  return { best, evLoss, score, kindFrequency };
}

export const GRADES = [
  { id: 'best', label: 'Best move', min: 97 },
  { id: 'good', label: 'Good', min: 80 },
  { id: 'inaccuracy', label: 'Inaccuracy', min: 55 },
  { id: 'mistake', label: 'Mistake', min: 30 },
  { id: 'blunder', label: 'Blunder', min: 0 },
];

export function gradeOf(score) {
  return GRADES.find((g) => score >= g.min) ?? GRADES[GRADES.length - 1];
}

// Whole-hand accuracy: decisions in bigger pots count more (sqrt of the pot in big blinds), and so do the bad
// ones: a decision's weight grows up to 3x as its score falls, so a blunder isn't averaged away by the easy
// decisions around it.
export function overallAccuracy(decisions, bb) {
  if (decisions.length === 0) return null;
  let total = 0;
  let weights = 0;
  for (const d of decisions) {
    const weight = Math.sqrt(clamp(d.potRef / bb, 1, 400)) * (1 + 2 * (1 - d.score / 100));
    total += d.score * weight;
    weights += weight;
  }
  return Math.round(total / weights);
}

export function accuracyLabel(accuracy) {
  if (accuracy === null) return 'No decisions';
  if (accuracy >= 90) return 'Excellent';
  if (accuracy >= 80) return 'Strong';
  if (accuracy >= 65) return 'Decent';
  if (accuracy >= 50) return 'Shaky';
  return 'Rough';
}
