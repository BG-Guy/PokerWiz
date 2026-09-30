// Poker hand evaluator for 5 to 7 cards. Returns a number where higher = stronger hand,
// so comparing two hands is just comparing two numbers.
// Cards are integers 0..51 (see utils/cards.js): rank = (card >> 2) + 2 (2..14), suit = card & 3.
import { codeToIndex } from './cards.js';

export const HAND_NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
];

// Pack a category (0-8) and up to five tie-break ranks into one comparable number.
function score(category, kickers) {
  let value = category;
  for (let i = 0; i < 5; i++) value = value * 16 + (kickers[i] ?? 0);
  return value;
}

// Highest straight in a rank bitmask (bit r set = rank r present), or 0. Handles the A-2-3-4-5 wheel.
function straightHigh(mask) {
  if (mask & (1 << 14)) mask |= 1 << 1;
  for (let high = 14; high >= 5; high--) {
    if (((mask >> (high - 4)) & 31) === 31) return high;
  }
  return 0;
}

// Top n ranks present in a bitmask, high to low.
function topRanks(mask, n) {
  const ranks = [];
  for (let r = 14; r >= 2 && ranks.length < n; r--) if (mask & (1 << r)) ranks.push(r);
  return ranks;
}

export function evaluate(cards) {
  const counts = new Array(15).fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  let rankMask = 0;

  for (const card of cards) {
    const rank = (card >> 2) + 2;
    const suit = card & 3;
    counts[rank]++;
    suitMasks[suit] |= 1 << rank;
    suitCounts[suit]++;
    rankMask |= 1 << rank;
  }

  // Flush / straight flush. With 7 cards a flush rules out quads and full houses, so checking it first is safe.
  for (let s = 0; s < 4; s++) {
    if (suitCounts[s] >= 5) {
      const high = straightHigh(suitMasks[s]);
      return high ? score(8, [high]) : score(5, topRanks(suitMasks[s], 5));
    }
  }

  // Group ranks by how many times they appear, high to low.
  let quad = 0;
  const trips = [];
  const pairs = [];
  const singles = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
    else if (counts[r] === 1) singles.push(r);
  }

  if (quad) {
    const kicker = Math.max(trips[0] ?? 0, pairs[0] ?? 0, singles[0] ?? 0);
    return score(7, [quad, kicker]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    return score(6, [trips[0], Math.max(trips[1] ?? 0, pairs[0] ?? 0)]);
  }
  const straight = straightHigh(rankMask);
  if (straight) return score(4, [straight]);
  if (trips.length) return score(3, [trips[0], ...singles.slice(0, 2)]);
  if (pairs.length >= 2) return score(2, [pairs[0], pairs[1], Math.max(pairs[2] ?? 0, singles[0] ?? 0)]);
  if (pairs.length === 1) return score(1, [pairs[0], ...singles.slice(0, 3)]);
  return score(0, singles.slice(0, 5));
}

// Category index (0-8) of a score.
export function categoryOf(value) {
  return Math.floor(value / 16 ** 5);
}

// Readable name of the best hand made by these card codes, e.g. "Two pair". Needs at least 5 cards.
export function describeHand(codes) {
  if (codes.length < 5) return null;
  return HAND_NAMES[categoryOf(evaluate(codes.map(codeToIndex)))];
}

// Evaluate card codes directly (used for showdowns in Add Hand).
export function evaluateCodes(codes) {
  return evaluate(codes.map(codeToIndex));
}
