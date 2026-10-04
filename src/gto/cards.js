// Cards and hands for the GTO engine (src/gto). Two encodings meet here:
//   app codes   "As", "Td" (utils/cards.js; the rest of the app)
//   card ids    rank * 4 + suit, ranks 2..A = 0..12, suits c d h s = 0..3 (postflop-solver's encoding)
// The 1326 two-card hands are numbered in postflop-solver's order (handIndex), and every hand belongs to one of
// the 169 starting-hand classes (AA, AKs, AKo, ...), numbered on the usual 13x13 grid with aces first:
// pairs on the diagonal, suited hands above it, offsuit below (the same grid as the coach's range charts).

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const HAND_COUNT = 1326;
export const CLASS_COUNT = 169;

export const cardId = (code) => RANK_CHARS.indexOf(code[0]) * 4 + SUIT_CHARS.indexOf(code[1]);
export const cardCode = (id) => RANK_CHARS[id >> 2] + SUIT_CHARS[id & 3];
export const rankOf = (id) => id >> 2;
export const suitOf = (id) => id & 3;

// Hand index of two card ids (postflop-solver's formula: triangular numbering, lower card first).
export function handIndex(a, b) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return (lo * (101 - lo)) / 2 + hi - 1;
}

// The two cards of every hand, in hand-index order.
export const HAND_CARDS = (() => {
  const cards = new Array(HAND_COUNT);
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) cards[handIndex(a, b)] = [a, b];
  return cards;
})();

// Class of a hand on the 13x13 grid (row and column 0 = ace).
export function classOfCards(a, b) {
  const rowHigh = 12 - Math.max(rankOf(a), rankOf(b));
  const rowLow = 12 - Math.min(rankOf(a), rankOf(b));
  if (rowHigh === rowLow) return rowHigh * 13 + rowHigh;
  return suitOf(a) === suitOf(b) ? rowHigh * 13 + rowLow : rowLow * 13 + rowHigh;
}

export const HAND_CLASS = Int16Array.from(HAND_CARDS, ([a, b]) => classOfCards(a, b));

// "AA", "AKs", "T9o" for each class; combos per class (6 pairs, 4 suited, 12 offsuit).
export const CLASS_NAMES = Array.from({ length: CLASS_COUNT }, (_, cls) => {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  const high = RANK_CHARS[12 - Math.min(row, col)];
  const low = RANK_CHARS[12 - Math.max(row, col)];
  if (row === col) return high + low;
  return high + low + (row < col ? 's' : 'o');
});
export const CLASS_COMBOS = Int8Array.from({ length: CLASS_COUNT }, (_, cls) => {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  return row === col ? 6 : row < col ? 4 : 12;
});
export const isPairClass = (cls) => Math.floor(cls / 13) === cls % 13;
export const isSuitedClass = (cls) => Math.floor(cls / 13) < cls % 13;

// Hands of each class, as hand indices.
export const CLASS_HANDS = (() => {
  const lists = Array.from({ length: CLASS_COUNT }, () => []);
  HAND_CLASS.forEach((cls, hand) => lists[cls].push(hand));
  return lists;
})();

// A 1326-weight range from 169 class weights (every combo of a class gets the class weight), with hands that
// use any of the dead cards (the board, your own cards) set to 0.
export function expandClasses(classWeights, dead = []) {
  const blocked = new Set(dead);
  const weights = new Float32Array(HAND_COUNT);
  for (let hand = 0; hand < HAND_COUNT; hand++) {
    const [a, b] = HAND_CARDS[hand];
    if (blocked.has(a) || blocked.has(b)) continue;
    weights[hand] = classWeights[HAND_CLASS[hand]];
  }
  return weights;
}

// Class weights from a 1326-weight range: the average weight of the class's live combos.
export function collapseToClasses(weights) {
  const sums = new Float64Array(CLASS_COUNT);
  const counts = new Float64Array(CLASS_COUNT);
  for (let hand = 0; hand < HAND_COUNT; hand++) {
    sums[HAND_CLASS[hand]] += weights[hand];
    counts[HAND_CLASS[hand]] += 1;
  }
  return Float64Array.from(sums, (sum, cls) => (counts[cls] ? sum / counts[cls] : 0));
}

// The rest of the app numbers cards with suits s h d c (utils/cards.js), here they're c d h s: the same
// rank * 4 + suit layout with the suit order reversed, so converting is flipping the two suit bits.
export const appCardToId = (index) => index ^ 3;
export const idToAppCard = (id) => id ^ 3;

// The coach's combo list (coach/combos.js) is the same triangle over the app's card numbers: where each hand
// here sits in it.
export const APP_COMBO_OF_HAND = Int16Array.from(HAND_CARDS, ([a, b]) => handIndex(a ^ 3, b ^ 3));

// A 1326-weight range in this module's order -> the coach's combo order (Float64Array).
export function toAppRange(weights) {
  const out = new Float64Array(HAND_COUNT);
  for (let h = 0; h < HAND_COUNT; h++) out[APP_COMBO_OF_HAND[h]] = weights[h];
  return out;
}
