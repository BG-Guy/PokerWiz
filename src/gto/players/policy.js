// How a player with tendencies plays a postflop spot: a strategy for every hand of their range at one
// decision of a solve (src/gto/postflop/solver.js mixes it with the player's own CFR strategy).
//
// It works from each hand's effective strength on the board (made hand plus draws, coach/boardStrength.js)
// and the model's parameters (coach/profiles.js modelParams):
//   facing a bet   continue with the share of the range that minimum defence asks for, divided by foldMult
//                  (a calling station continues with nearly everything, a nit with much less); raise the
//                  top of the range by aggression, plus a few bluff raises (bluffMult)
//   checked to     bet the top of the range (wider when aggressive), bluff weak hands (bluffMult), avoid big
//                  bluffs when bigBluffShy; aggressive players pick bigger sizes, passive ones smaller
//   noise          softens every threshold and mixes in random play (a drunk is mostly noise)
import { computeStrengths } from '../../coach/boardStrength.js';
import { APP_COMBO_OF_HAND, idToAppCard } from '../cards.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const AGGRESSIVE = new Set(['bet', 'raise', 'allin']);

// Effective strength of each hand of a list on a board (0 weakest ... 1 the nuts), cached per board.
const strengthCache = new Map();
function strengthsFor(list, board) {
  const key = board.join(',');
  let eff = strengthCache.get(key);
  if (!eff) {
    if (strengthCache.size > 64) strengthCache.clear();
    eff = computeStrengths(board.map(idToAppCard)).eff;
    strengthCache.set(key, eff);
  }
  return Float32Array.from(list.hands, (h) => eff[APP_COMBO_OF_HAND[h]]);
}

// The strength above which the top `share` of a weighted range lies.
function thresholdFor(strength, weights, share) {
  const order = Array.from(strength.keys()).sort((a, b) => strength[b] - strength[a]);
  let total = 0;
  for (const k of order) total += weights[k];
  let seen = 0;
  for (const k of order) {
    seen += weights[k];
    if (seen >= share * total) return strength[k];
  }
  return 0;
}

// params: modelParams(profile). node: a decision node of the solve tree; list: the acting player's hands.
// Returns Float32Array(actions x hands), action-major (like the solver's strategies).
export function postflopPolicy(params, node, list) {
  const n = list.count;
  const A = node.actions.length;
  const out = new Float32Array(A * n);
  const strength = strengthsFor(list, node.board);
  const soft = 0.02 + 0.5 * params.noise; // how blurry the thresholds are
  const aggro = clamp(params.aggression / 2, 0.15, 3.5); // ~1 for an average player
  const kinds = node.actions.map((a) => a.type);
  const index = (type) => kinds.indexOf(type);
  // Aggressive options from smallest to biggest, and the one this player prefers.
  const sized = node.actions.map((a, i) => ({ i, to: a.to })).filter((x) => AGGRESSIVE.has(kinds[x.i])).sort((a, b) => a.to - b.to);
  const pick = (big) => (sized.length ? sized[Math.round(clamp(big, 0, 1) * (sized.length - 1))].i : -1);
  const preferBig = clamp((aggro - 0.6) / 1.8, 0, 1);

  if (node.toCall > 0) {
    // Facing a bet: minimum defence, bent by how much this player likes folding.
    const before = node.pot - node.toCall;
    const mdf = clamp(before / node.pot, 0.2, 0.95);
    const continueShare = clamp(mdf / params.foldMult, 0.02, 0.98);
    const raiseShare = clamp(0.035 * aggro, 0.004, 0.3);
    const tContinue = thresholdFor(strength, list.weights, continueShare);
    const tRaise = thresholdFor(strength, list.weights, raiseShare);
    const fold = index('fold');
    const call = index('call');
    const raise = pick(preferBig);
    const bluffRaise = raise >= 0 ? clamp(0.025 * params.bluffMult, 0, 0.3) : 0;
    for (let k = 0; k < n; k++) {
      const e = strength[k];
      const cont = sigmoid((e - tContinue) / soft);
      const value = raise >= 0 ? sigmoid((e - tRaise) / soft) : 0;
      const raising = Math.min(1, value + (1 - cont) * bluffRaise);
      const calling = Math.max(0, cont - value);
      if (raise >= 0) out[raise * n + k] += raising;
      if (call >= 0) out[call * n + k] += calling;
      if (fold >= 0) out[fold * n + k] += Math.max(0, 1 - raising - calling);
      else if (call >= 0) out[call * n + k] += Math.max(0, 1 - raising - calling);
    }
  } else {
    // Checked to, or first to act: value bets from the top, bluffs from the bottom.
    const check = index('check');
    const valueShare = clamp(0.18 * aggro, 0.03, 0.75);
    const tValue = thresholdFor(strength, list.weights, valueShare);
    const valueSize = pick(preferBig);
    const bluffSize = pick(preferBig * (1 - params.bigBluffShy));
    const bluff = clamp(0.1 * params.bluffMult, 0, 0.6);
    for (let k = 0; k < n; k++) {
      const e = strength[k];
      const value = valueSize >= 0 ? sigmoid((e - tValue) / soft) : 0;
      const bluffing = bluffSize >= 0 && e < 0.45 ? (1 - value) * bluff : 0;
      if (valueSize >= 0) out[valueSize * n + k] += value;
      if (bluffSize >= 0) out[bluffSize * n + k] += bluffing;
      if (check >= 0) out[check * n + k] += Math.max(0, 1 - value - bluffing);
    }
  }

  // Random play on top (drunks, beginners, tilt), then every hand's row sums to 1.
  const noise = clamp(params.noise, 0, 0.6);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let a = 0; a < A; a++) sum += out[a * n + k];
    for (let a = 0; a < A; a++) out[a * n + k] = (1 - noise) * (sum > 0 ? out[a * n + k] / sum : 1 / A) + noise / A;
  }
  return out;
}
