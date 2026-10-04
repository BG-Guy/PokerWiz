// Turning decisions into accuracy scores and chess-style labels, against the GTO solution (gto/).
//
// A decision's EV loss is measured against the pot at that moment (losing 10% of the pot is a real mistake,
// $3 in a $600 pot is noise) and in big blinds (a 10 bb leak matters even in a huge pot).
// The hero's skill level sets the tolerance: a beginner isn't marked down for tiny edges, a pro is.
// GTO mixes its plays, so how often it takes your option counts too (gradeAgainstGto).

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// EV loss (in chips) -> score 0..100. Losses count both relative to the pot (how wrong the decision was)
// and in big blinds (how much it actually cost). Tolerance: 3% of the pot for amateurs, 1% for pros.
export function scoreFromLoss(evLoss, potRef, heroSkill = 0.5, bb = 1) {
  const tolerance = (0.03 + (0.01 - 0.03) * heroSkill) * potRef;
  const counted = Math.max(0, evLoss - tolerance);
  const relative = (3.5 * counted) / Math.max(potRef, 1e-9);
  const absolute = (0.025 * counted) / Math.max(bb, 1e-9);
  return Math.round(100 * Math.exp(-relative - absolute));
}

// GTO mixes: an option it takes at least this often with your hand is as good as the best one (at equilibrium
// every option it mixes is worth the same), and one it takes now and then is never worse than "Good".
export const MIXED_BEST = 0.2;
export const MIXED_GOOD = 0.05;

// Grade a decision against the GTO advice (gto/hand.js). advice.options: [{ frequency, ev (chips vs folding,
// postflop) }], advice.lossBB (preflop: bb worse than the best option). Returns { best, evLoss (chips), score }.
export function gradeAgainstGto({ advice, actual, potRef, heroSkill, bb }) {
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
  let score = actual === best ? 100 : hasValues ? scoreFromLoss(evLoss, potRef, heroSkill, bb) : Math.round(100 * Math.min(1, frequency / MIXED_BEST));
  if (frequency >= MIXED_BEST) score = 100;
  else if (frequency >= MIXED_GOOD) score = Math.min(96, Math.max(score, 85));
  else if (actual !== best && advice.lossBB) {
    // Preflop values are stored coarsely (tiny differences round to zero), so an option GTO (almost) never
    // takes is capped below "Good" however close its value looks.
    score = Math.min(score, Math.round(60 + 400 * frequency));
  } else if (actual !== best) {
    // Postflop: a play GTO doesn't make is never "Best", however close in value. The right kind of play in a
    // size GTO rarely uses is still "Good" when it costs little.
    score = Math.min(score, 96);
    if (kindFrequency >= 0.5 && evLoss <= 0.02 * potRef) score = Math.max(score, 85);
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

// Whole-hand accuracy: decisions in bigger pots count more (weight = sqrt of the pot in big blinds).
export function overallAccuracy(decisions, bb) {
  if (decisions.length === 0) return null;
  let total = 0;
  let weights = 0;
  for (const d of decisions) {
    const weight = Math.sqrt(clamp(d.potRef / bb, 1, 400));
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
