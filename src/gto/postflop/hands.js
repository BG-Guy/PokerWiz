// Ranges inside a postflop solve: each player's possible hands (the 1326 combos minus the ones the board blocks
// or the range never holds), with their starting weights, plus the lookups card removal needs.
import { HAND_COUNT, HAND_CARDS } from '../cards.js';

// weights: 1326 weights (hand-index order); board: card ids. Hands below `floor` x the heaviest are dropped,
// except the ones in `include` (hands we need answers for, like your own: kept with at least a trace weight,
// so the solve can value them without changing anyone's strategy).
// Returns { count, hands: Int16Array (hand indices), c1, c2: Uint8Array (cards), weights: Float32Array,
//           position: Int32Array(1326) (where each hand index sits in this list, or -1) }.
const TRACE = 1e-5;
export function buildHandList(weights, board, floor = 1e-4, include = []) {
  const dead = new Set(board);
  let max = 0;
  for (let h = 0; h < HAND_COUNT; h++) {
    const [a, b] = HAND_CARDS[h];
    if (!dead.has(a) && !dead.has(b) && weights[h] > max) max = weights[h];
  }
  const forced = new Set(include);
  const kept = [];
  for (let h = 0; h < HAND_COUNT; h++) {
    const [a, b] = HAND_CARDS[h];
    if (dead.has(a) || dead.has(b)) continue;
    if ((weights[h] > 0 && weights[h] >= floor * max) || forced.has(h)) kept.push(h);
  }
  if (max === 0) max = 1;
  const position = new Int32Array(HAND_COUNT).fill(-1);
  kept.forEach((h, k) => {
    position[h] = k;
  });
  return {
    count: kept.length,
    hands: Int16Array.from(kept),
    c1: Uint8Array.from(kept, (h) => HAND_CARDS[h][0]),
    c2: Uint8Array.from(kept, (h) => HAND_CARDS[h][1]),
    weights: Float32Array.from(kept, (h) => Math.max(weights[h] / max, forced.has(h) ? TRACE : 0)),
    position,
  };
}

// For every hand of list `a`, where the same two cards sit in list `b` (-1 if b can't hold them): needed to
// add back the one combo that card-removal sums subtract twice.
export function sameHandIndex(a, b) {
  return Int32Array.from(a.hands, (h) => b.position[h]);
}

// Hands of a list holding a given card: card -> Int32Array of positions.
export function handsByCard(list) {
  const buckets = Array.from({ length: 52 }, () => []);
  for (let k = 0; k < list.count; k++) {
    buckets[list.c1[k]].push(k);
    buckets[list.c2[k]].push(k);
  }
  return buckets.map((positions) => Int32Array.from(positions));
}
