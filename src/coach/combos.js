// All 1326 two-card combos and the 169 starting-hand classes ("AKs", "QQ", "T9o") they belong to.
// Cards are integers 0..51 (rankIndex * 4 + suitIndex, see utils/cards.js).
// Classes are laid out like the classic 13x13 range grid: row = first rank, column = second rank
// (both from A down to 2); suited hands above the diagonal, offsuit below, pairs on it.
import { RANKS } from '../utils/cards.js';

const RANK_CHARS_DESC = 'AKQJT98765432';

// Rank index in the descending grid order (A = 0 ... 2 = 12) for a card integer.
const gridRank = (card) => 12 - (card >> 2);

// Grid cell (0..168) of a two-card combo.
export function classOf(c1, c2) {
  const r1 = gridRank(c1);
  const r2 = gridRank(c2);
  const high = Math.min(r1, r2);
  const low = Math.max(r1, r2);
  if (high === low) return high * 13 + high; // pair
  const suited = (c1 & 3) === (c2 & 3);
  return suited ? high * 13 + low : low * 13 + high;
}

// Class names by grid cell: "AA", "AKs", "AKo", ...
export const CLASS_NAMES = Array.from({ length: 169 }, (_, cell) => {
  const row = Math.floor(cell / 13);
  const col = cell % 13;
  if (row === col) return RANK_CHARS_DESC[row] + RANK_CHARS_DESC[col];
  if (row < col) return RANK_CHARS_DESC[row] + RANK_CHARS_DESC[col] + 's';
  return RANK_CHARS_DESC[col] + RANK_CHARS_DESC[row] + 'o';
});

// Number of combos in each class: pairs 6, suited 4, offsuit 12.
export const CLASS_COMBOS = Array.from({ length: 169 }, (_, cell) => {
  const row = Math.floor(cell / 13);
  const col = cell % 13;
  if (row === col) return 6;
  return row < col ? 4 : 12;
});

// Every combo once: { cards: [c1, c2], cls }
export const COMBOS = [];
for (let a = 0; a < 52; a++) {
  for (let b = a + 1; b < 52; b++) COMBOS.push({ cards: [a, b], cls: classOf(a, b) });
}
export const COMBO_COUNT = COMBOS.length; // 1326

// Combo index lookup by its two cards.
const indexByPair = new Int16Array(52 * 52).fill(-1);
COMBOS.forEach((combo, i) => {
  const [a, b] = combo.cards;
  indexByPair[a * 52 + b] = i;
  indexByPair[b * 52 + a] = i;
});
export function comboIndex(c1, c2) {
  return indexByPair[c1 * 52 + c2];
}

// True when a combo shares a card with any of the given dead cards (Set or array of ints).
export function comboBlocked(combo, dead) {
  const has = dead instanceof Set ? (c) => dead.has(c) : (c) => dead.includes(c);
  return has(combo.cards[0]) || has(combo.cards[1]);
}

// "AKs" style name for two card codes like ["As", "Kd"].
export function classNameOfCodes(codes) {
  const toInt = (code) => RANKS.indexOf(code[0]) * 4 + 'shdc'.indexOf(code[1]);
  return CLASS_NAMES[classOf(toInt(codes[0]), toInt(codes[1]))];
}
