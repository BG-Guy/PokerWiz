// What a hand is worth when the preflop betting ends, for the preflop solver (scripts/gto/solvePreflop.mjs).
//
//   all in      pure equity: the board is dealt out (heads-up: class vs class; 3-way: class vs two strength
//               buckets, see buildEquityTables.mjs)
//   flop seen   equity x realization: postflop the player in position, and hands that flop well (suited,
//               connected, pairs), win more than their raw equity; stronger hands win bigger pots. The
//               effect shrinks as the stack-to-pot ratio drops (with little behind, a flop is close to all in).
//
// Every matrix here is already multiplied by the card-removal weights K(i, j) = compatible combo pairs /
// (combos of i x 1225), so a player's value is one matrix-vector product with the opponent's reach.
import { CLASS_COUNT, CLASS_COMBOS, isPairClass, isSuitedClass } from '../../../src/gto/cards.js';

const N = CLASS_COUNT;

// Ranks of a class on the grid (12 = ace ... 0 = deuce): [high, low].
export function classRanks(cls) {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  return [12 - Math.min(row, col), 12 - Math.max(row, col)];
}

// How well a hand plays after the flop, beyond its raw equity (roughly -0.09 .. +0.08).
export function playability(cls) {
  const [high, low] = classRanks(cls);
  if (isPairClass(cls)) return 0.02;
  const gap = high - low - 1;
  let bonus = isSuitedClass(cls) ? 0.045 : -0.01;
  bonus += gap === 0 ? 0.03 : gap === 1 ? 0.02 : gap === 2 ? 0.008 : -0.012;
  if (high === 12 && low <= 3 && isSuitedClass(cls)) bonus += 0.012; // suited wheel aces: nut flush + straights
  if (low >= 8) bonus += 0.012; // two broadways: top pairs with good kickers
  // Disconnected offsuit hands rarely flop well, and low ones even less: they fold to most bets.
  if (!isSuitedClass(cls) && gap >= 3 && low < 8) bonus -= 0.045;
  if (!isSuitedClass(cls) && high < 8) bonus -= 0.02;
  return bonus;
}

// The realization model's settings: position effect by postflop order among the players who saw the flop
// (heads-up: out of position, in position; 3-way: first, middle, last), and how much stronger hands
// out-earn their equity (gamma: 1 = not at all).
export const DEFAULT_MODEL = { edge2: [-0.14, 0.1], edge3: [-0.12, -0.03, 0.09], gamma: 0.5, sprScale: 4 };

// How much of the postflop edge (position, playability, strength) applies at this stack-to-pot ratio: all of
// it once there's `scale` pots behind, fading toward pure equity as the stacks get short.
export const sprWeight = (spr, scale = 8) => Math.min(1, Math.max(0.12, spr / scale));

// Stack-to-pot ratios are cached in half steps up to 16 (deeper plays the same).
const sprBucket = (spr) => Math.min(16, Math.round(spr * 2)) / 2;

export function createPayoffs(table, model = DEFAULT_MODEL) {
  const POSITION_EDGE = { 2: model.edge2, 3: model.edge3 };
  const { equity, compatible, threeWay, buckets, bucketOf } = table;
  const B = buckets;

  // K(i, j): card-removal weight of class j's combos for one combo of class i.
  const K = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) K[i * N + j] = compatible[i][j] / (CLASS_COMBOS[i] * 1225);

  // All in, heads-up: K * equity.
  const allIn2 = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) allIn2[i * N + j] = K[i * N + j] * equity[i][j];

  // Flop, heads-up: realized pot share of i (at postflop seat `seat`: 0 = out of position) against j,
  // cached by seat and stack-to-pot bucket.
  const play = Float64Array.from({ length: N }, (_, cls) => playability(cls));
  const flopCache = new Map();
  function flop2(seat, spr) {
    const bucket = sprBucket(spr);
    const key = `${seat}:${bucket}`;
    if (flopCache.has(key)) return flopCache.get(key);
    const w = sprWeight(bucket, model.sprScale);
    const gamma = 1 + model.gamma * w; // stronger hands win more than their share when stacks are deep
    const [mine, theirs] = seat === 0 ? POSITION_EDGE[2] : [POSITION_EDGE[2][1], POSITION_EDGE[2][0]];
    const matrix = new Float64Array(N * N);
    for (let i = 0; i < N; i++) {
      const ri = 1 + w * (mine + play[i]);
      for (let j = 0; j < N; j++) {
        const e = equity[i][j];
        const rj = 1 + w * (theirs + play[j]);
        const a = e ** gamma * ri;
        const b = (1 - e) ** gamma * rj;
        matrix[i * N + j] = K[i * N + j] * (a / (a + b));
      }
    }
    flopCache.set(key, matrix);
    return matrix;
  }

  // 3-way: p's pot share against buckets (y, z), flattened [class][y * B + z]. Seeing a flop multiplies it by
  // p's realization (position among the three, playability measured against the typical 3-way hand, about
  // +0.02), so the three shares add up to about 1.
  const share3Cache = new Map();
  function share3Table(seat, spr, isFlop) {
    const bucket = isFlop ? sprBucket(spr) : -1;
    const key = `${seat}:${bucket}`;
    if (!share3Cache.has(key)) {
      const flat = new Float64Array(N * B * B);
      for (let i = 0; i < N; i++) {
        const factor = isFlop ? 1 + sprWeight(bucket, model.sprScale) * (POSITION_EDGE[3][seat] + play[i] - 0.02) : 1;
        for (let k = 0; k < B * B; k++) flat[i * B * B + k] = threeWay[i][k] * factor;
      }
      share3Cache.set(key, flat);
    }
    return share3Cache.get(key);
  }

  return { K, allIn2, flop2, share3Table, bucketOf: Int32Array.from(bucketOf), buckets: B };
}
