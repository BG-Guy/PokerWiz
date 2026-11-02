// Letter grades (A to F) for any 0-100 score the app shows: the coach's accuracy, each graded decision,
// Practice's results and running average, and session grades. The stored numbers stay 0-100; only the display changes.

// Lowest score for each letter, best first, with the word that goes with it.
export const LETTERS = [
  [85, 'A', 'Excellent'],
  [70, 'B', 'Good'],
  [55, 'C', 'OK'],
  [40, 'D', 'Rough'],
  [0, 'F', 'Poor'],
];

// How each letter is colored: A and B good, C neutral, D a warning, F bad.
const TONES = { A: 'good', B: 'good', C: 'neutral', D: 'warning', F: 'bad' };

// score (0-100) -> { letter, label, tone }, or null when there's no score (nothing was graded).
export function letterGrade(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  const [, letter, label] = LETTERS.find(([min]) => Math.round(score) >= min) ?? LETTERS.at(-1);
  return { letter, label, tone: TONES[letter] };
}

// The letter alone ("B"), or a dash when there's no score.
export const letterOf = (score) => letterGrade(score)?.letter ?? '–';
