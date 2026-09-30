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

// The evaluator runs millions of times per coach review (equity sampling), so it allocates nothing:
// scratch counters live at module level and scores are built with arithmetic.
const counts = new Uint8Array(15);
const suitMasks = new Int32Array(4);
const suitCounts = new Uint8Array(4);

// Highest straight in a rank bitmask (bit r set = rank r present), or 0. Handles the A-2-3-4-5 wheel.
function straightHigh(mask) {
  if (mask & (1 << 14)) mask |= 1 << 1;
  for (let high = 14; high >= 5; high--) {
    if (((mask >> (high - 4)) & 31) === 31) return high;
  }
  return 0;
}

// Pack a category (0-8) and five tie-break ranks (0 = none) into one comparable number.
const pack = (category, a = 0, b = 0, c = 0, d = 0, e = 0) => ((((category * 16 + a) * 16 + b) * 16 + c) * 16 + d) * 16 + e;

// The top n ranks of a bitmask, high to low, packed after a category.
function packTop(category, mask, n) {
  let value = category;
  let taken = 0;
  for (let r = 14; r >= 2 && taken < n; r--) {
    if (mask & (1 << r)) {
      value = value * 16 + r;
      taken++;
    }
  }
  for (; taken < 5; taken++) value *= 16;
  return value;
}

// cards: 5 to 7 card integers. Extra board cards can be passed separately (board, boardCount) to avoid
// building a combined array in hot loops.
export function evaluate(cards, board = null, boardCount = 0) {
  counts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let rankMask = 0;
  const total = cards.length + boardCount;
  for (let i = 0; i < total; i++) {
    const card = i < cards.length ? cards[i] : board[i - cards.length];
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
      return high ? pack(8, high) : packTop(5, suitMasks[s], 5);
    }
  }

  // Group ranks by how many times they appear, high to low (no arrays: the top few of each are enough).
  let quad = 0;
  let trip1 = 0;
  let trip2 = 0;
  let pair1 = 0;
  let pair2 = 0;
  let pair3 = 0;
  let singleMask = 0;
  for (let r = 14; r >= 2; r--) {
    const c = counts[r];
    if (c === 4) quad = r;
    else if (c === 3) {
      if (!trip1) trip1 = r;
      else if (!trip2) trip2 = r;
    } else if (c === 2) {
      if (!pair1) pair1 = r;
      else if (!pair2) pair2 = r;
      else if (!pair3) pair3 = r;
    } else if (c === 1) singleMask |= 1 << r;
  }
  const topSingle = singleMask ? 31 - Math.clz32(singleMask) : 0;

  if (quad) return pack(7, quad, Math.max(trip1, pair1, topSingle));
  if (trip1 && (trip2 || pair1)) return pack(6, trip1, Math.max(trip2, pair1));
  const straight = straightHigh(rankMask);
  if (straight) return pack(4, straight);
  if (trip1) return packTop(3 * 16 + trip1, singleMask, 2) / 16;
  if (pair2) return pack(2, pair1, pair2, Math.max(pair3, topSingle));
  if (pair1) return packTop(16 + pair1, singleMask, 3) / 16;
  return packTop(0, singleMask, 5);
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
