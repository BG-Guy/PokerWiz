// Turning expected-value losses into accuracy scores and chess-style labels.
//
// A decision's EV loss is measured against the pot at that moment (losing 10% of the pot is a real mistake,
// $3 in a $600 pot is noise) and in big blinds (a 10 bb leak matters even in a huge pot).
// The hero's skill level sets the tolerance: a beginner isn't marked down for tiny edges, a pro is.

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

// Preflop chart distance (share of hands between the hand and the right boundary, already weighted) -> score.
export function scoreFromDistance(distance) {
  return Math.round(100 * Math.exp(-Math.max(0, distance) / 0.15));
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
