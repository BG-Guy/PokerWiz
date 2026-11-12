// How a player with tendencies plays a postflop spot: a strategy for every hand of their range at one
// decision of a solve (src/gto/postflop/solver.js mixes it with the player's GTO strategy).
//
// It models how live players decide: from what the hand is on this board (coach/boardStrength.js), not from
// what a balanced range would do. Each hand is placed among all the hands possible on the board: `top` is the
// share of them that's stronger (0 = the nuts), so "the top 3%" means the same thing on a dry board (sets) and
// on a four-flush board (the big flushes).
//   facing a bet   Call when the hand is strong enough for the price: the bar rises with the equity a call
//                  needs, so the same player calls a third of the pot with any pair and folds top pair to a
//                  bet of four pots. Sticky players have a lower bar, nits a higher one. Draws call.
//                  Raise for value only near the top of what's possible: about the top 7% on the flop, 5% on
//                  the turn and 3% on the river against a small bet, less against a big one, a big raise or a
//                  raise. So a turn or river raise is two pair or better, and a check-raise all in over a
//                  pot-sized river bet is the nuts. Passive players often just call with those hands (a
//                  slowplay), so their calling range keeps its monsters.
//                  Bluff-raises and semi-bluffs are rare, rarer on later streets and for players who don't
//                  bluff big.
//   checked to     Bet for value when the hand is strong enough for the size: bigger bets need stronger
//                  hands, and unskilled players size by strength (the nuts go big, a thin value bet small),
//                  so a size says something. Bluff weak hands at the player's rate, in small sizes when
//                  they're shy of big bluffs. Betting into the last street's aggressor (a lead) needs a much
//                  stronger hand; betting again as that aggressor (a continuation bet) is looser.
//   noise          blurs the thresholds; only wild players (drunk, tilted) also act at random.
import { computeStrengths } from '../../coach/boardStrength.js';
import { APP_COMBO_OF_HAND, idToAppCard } from '../cards.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const AGGRESSIVE = new Set(['bet', 'raise', 'allin']);

// Per street (flop, turn, river).
// Calling: the strength a call needs = CALL_BASE + CALL_SLOPE x the equity the price asks for, lower on the
// early streets (cards to come). On the river that's about: any pair against a third of the pot, second pair
// against three quarters, a good top pair against a pot and a half, two pair against four pots.
const CALL_BASE = 0.11;
const CALL_SLOPE = 1.95;
const CALL_EARLY = [0.08, 0.04, 0];
// More for each raise behind the bet (a raise, or a bet from the player who raised the street before): a raise
// says more than a bet, and players give it more credit.
const CALL_RAISED = 0.08;
// Value raises: the top share of all possible hands that raises a small bet.
const RAISE_TOP = [0.07, 0.05, 0.03];
// Value bets: the top share of all possible hands that bets a small size (bigger sizes: less, see betTop).
const BET_TOP = [0.42, 0.38, 0.33];
const SLOWPLAY = [1.2, 1, 0.7]; // how much of a player's slowplaying happens on each street
const TRAP = [1.2, 0.9, 0.5]; // ... and of their checking a strong hand
const BLUFF = [1.1, 0.9, 0.8]; // bluffing when checked to
const BLUFFS_PER_RAISE = 0.07; // bluff raises for each value raise: an average player on the flop
const BLUFF_RAISE = [1, 0.6, 0.35]; // ... and how much of that is left on each street
const DRAWS_PER_RAISE = 1.2; // raises with a draw for each value raise: a player who plays draws fast, on the flop
const SEMI_BLUFF_RAISE = [1, 0.35, 0]; // ... and how much of that is left on each street
const SEMI_BLUFF_BET = [1, 0.6, 0]; // betting a draw when checked to
const STRONG_DRAW = [0.28, 0.15, Infinity]; // draw strength of about 7 outs or more
const WEAK = [0.42, 0.42, 0.4]; // below this a hand has nothing: it's a bluff when it bets
const LEAD = 0.6; // a lead of half the pot or more needs this much less of the top share
const NEAR_TOP = 0.002; // keeps the log of `top` finite at the nuts

// Strength of every hand on a board (made hand, draw and both together), cached per board.
const strengthCache = new Map();
function strengthsOn(board) {
  const key = board.join(',');
  let found = strengthCache.get(key);
  if (!found) {
    if (strengthCache.size > 400) strengthCache.clear();
    const { hs, draw, eff } = computeStrengths(board.map(idToAppCard));
    found = { hs, draw, eff };
    strengthCache.set(key, found);
  }
  return found;
}

// Shares of a list of sizes around a preferred one, on a log scale (they add up to 1).
function around(sizes, center, width = 0.6) {
  const weights = sizes.map((size) => Math.exp(-(Math.log(Math.max(size, 1e-6) / center) ** 2) / (2 * width * width)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (total > 0 ? w / total : 1 / sizes.length));
}

// params: modelParams(profile). node: a decision node of the solve tree (actions, pot, toCall, board, bets,
// raises, lead, barrel); list: the acting player's hands. Returns Float32Array(actions x hands), action-major
// (like the solver's strategies).
export function postflopPolicy(params, node, list) {
  const n = list.count;
  const A = node.actions.length;
  const out = new Float32Array(A * n);
  const strength = strengthsOn(node.board);
  const street = node.board.length - 3;
  const kinds = node.actions.map((a) => a.type);
  const aggro = clamp(params.aggression / 2, 0.15, 3.5); // ~1 for an average player
  const shy = params.bigBluffShy * clamp(1.8 - 0.9 * aggro, 0, 1); // aggressive players aren't shy of big bluffs
  const slow = clamp(0.55 - 0.2 * aggro, 0, 0.6); // how often a monster is slowplayed
  // How blurry the value thresholds are, on the log of `top`. Kept narrow: the hands just below a threshold
  // outnumber the ones above it many times over, so a wide edge would fill a raising range with them.
  const blur = 0.12 + 0.5 * params.noise;
  const preferBig = clamp((aggro - 0.6) / 1.8, 0, 1);
  // Aggressive options from smallest to biggest.
  const sized = node.actions.map((a, i) => ({ i, to: a.to })).filter((x) => AGGRESSIVE.has(kinds[x.i])).sort((a, b) => a.to - b.to);

  if (node.toCall > 0) {
    const fold = kinds.indexOf('fold');
    const call = kinds.indexOf('call');
    const price = node.toCall / Math.max(node.pot - node.toCall, 1e-9); // the bet as a share of the pot before it
    const odds = price / (1 + 2 * price); // the equity a call needs
    const raised = node.raises ?? Math.max(0, (node.bets ?? 1) - 1); // raises behind the bet faced
    const stick = Math.log(params.foldMult) * (params.foldMult < 1 ? 0.2 : 0.4);
    const callFrom = clamp(CALL_BASE + CALL_SLOPE * odds - CALL_EARLY[street] + stick + CALL_RAISED * raised, 0.1, 0.985);
    const softCall = 0.03 + 0.25 * params.noise;
    const drawCalls = clamp(1.1 - 0.25 * price, 0.3, 0.95);

    // Raises: by how far up the possible hands this one is, for each size (a bigger raise needs more).
    const callTo = call >= 0 ? node.actions[call].to : 0;
    const afterCall = node.pot + node.toCall;
    const raiseTop = (RAISE_TOP[street] * aggro ** 1.2) / ((1 + 1.5 * price) * (1 + raised));
    const cut = sized.map((x) => Math.log(raiseTop / (1 + (0.5 * (x.to - callTo)) / afterCall) + NEAR_TOP));
    const valueSize = around(sized.map((_, j) => j + 1), 1 + preferBig * (sized.length - 1), 0.7);
    const bluffSize = around(sized.map((_, j) => j + 1), 1 + preferBig * (1 - shy) * (sized.length - 1), 0.7);
    const slowplay = slow * SLOWPLAY[street];
    // Each hand's value raises, and whether it would otherwise continue.
    const continuing = new Float32Array(n);
    const raising = new Float32Array(n);
    let valueMass = 0;
    let foldMass = 0;
    let drawMass = 0;
    for (let k = 0; k < n; k++) {
      const c = APP_COMBO_OF_HAND[list.hands[k]];
      const top = Math.log(1 - strength.hs[c] + NEAR_TOP);
      const strongDraw = strength.draw[c] >= STRONG_DRAW[street];
      let continues = sigmoid((strength.eff[c] - callFrom) / softCall);
      if (strongDraw) continues = Math.max(continues, drawCalls);
      let value = 0;
      for (let j = 0; j < sized.length; j++) {
        const share = valueSize[j] * sigmoid((cut[j] - top) / blur) * (1 - slowplay);
        out[sized[j].i * n + k] += share;
        value += share;
      }
      continuing[k] = continues;
      raising[k] = value;
      valueMass += list.weights[k] * value;
      foldMass += list.weights[k] * (1 - value) * (1 - continues);
      if (strongDraw) drawMass += list.weights[k] * (1 - value) * continues;
    }
    // The other raises come as a share of the value raises (what a read is about: how often is this player's
    // raise not the goods?), so a player whose value raises are rare here doesn't raise much else either.
    //   bluffs   from the hands that would fold: BLUFFS_PER_RAISE to a value raise for an average player on
    //            the flop, fewer on later streets and for players shy of big bluffs, many for a maniac
    //   draws    from the strong draws: DRAWS_PER_RAISE to a value raise for a player who plays draws fast, on
    //            the flop; a third of that on the turn
    const later = BLUFF_RAISE[street] + (1 - BLUFF_RAISE[street]) * clamp((aggro - 1) / 1.2, 0, 1);
    const perValue = clamp(BLUFFS_PER_RAISE * params.bluffMult * aggro ** 2, 0, 0.8) * later * (1 - (street === 0 ? 0.3 : 0.9) * shy);
    const bluff = sized.length && foldMass > 0 ? Math.min(0.35, (perValue * valueMass) / foldMass) : 0;
    const drawsPerValue = DRAWS_PER_RAISE * params.drawAggro * Math.min(1.3, aggro) * SEMI_BLUFF_RAISE[street];
    const semi = sized.length && drawMass > 0 ? Math.min(0.6, (drawsPerValue * valueMass) / drawMass) : 0;

    for (let k = 0; k < n; k++) {
      // Not raising for value: continue or not, with now and then a semi-bluff or a bluff raise instead.
      const rest = 1 - raising[k];
      const continues = continuing[k];
      const semiBluff = strength.draw[APP_COMBO_OF_HAND[list.hands[k]]] >= STRONG_DRAW[street] ? semi : 0;
      const extra = rest * (continues * semiBluff + (1 - continues) * bluff);
      for (let j = 0; j < sized.length; j++) out[sized[j].i * n + k] += extra * bluffSize[j];
      const calling = rest * continues * (1 - semiBluff);
      const folding = rest * (1 - continues) * (1 - bluff);
      if (call >= 0) out[call * n + k] += calling;
      if (fold >= 0) out[fold * n + k] += folding;
      else if (call >= 0) out[call * n + k] += folding;
    }
  } else {
    const check = kinds.indexOf('check');
    const rel = sized.map((x) => x.to / Math.max(node.pot, 1e-9)); // each bet as a share of the pot
    // The top share of hands that bets each size for value: less for bigger bets, more for an aggressive
    // player or a continuation bet, much less for a real lead into the aggressor.
    const betTop = (size) => ((BET_TOP[street] * aggro ** 0.6) / (1 + size) ** 1.5) * (node.barrel ? 1.15 : 1) * (node.lead && size >= 0.5 ? LEAD : 1);
    const cut = rel.map((size) => Math.log(betTop(size) + NEAR_TOP));
    const likes = 0.45 + 0.5 * preferBig; // the size this player likes to bet
    const likesCut = Math.log(betTop(likes) + NEAR_TOP);
    const sizeTell = 1.2 * (1 - params.skill); // how much the size grows with the hand
    const trap = slow * TRAP[street];
    const bluffRate = clamp(0.085 * params.bluffMult * Math.sqrt(aggro), 0, 0.7) * BLUFF[street] * (node.barrel ? [1.8, 1.2, 1][street] : node.lead ? 0.5 : 1);
    const semi = clamp(0.15 + 0.45 * params.drawAggro * Math.min(1.3, aggro), 0, 0.8) * SEMI_BLUFF_BET[street];
    // Bluffs: around a smaller size for players shy of big bluffs, and rarely big at all.
    const bluffSize = sized.length ? around(rel, likes * (1 - 0.35 * shy)).map((share, j) => share * (1 - shy) ** (1.2 * Math.max(0, Math.log(rel[j] / 0.66)))) : [];
    const plainSize = sized.length ? around(rel, likes) : [];

    for (let k = 0; k < n; k++) {
      const c = APP_COMBO_OF_HAND[list.hands[k]];
      const top = Math.log(1 - strength.hs[c] + NEAR_TOP);
      let betting = 0;
      if (sized.length) {
        // Value: the size grows with how far above the bar the hand is.
        const lift = clamp((likesCut - top) / 3, 0, 1);
        const valueSize = lift > 0 ? around(rel, likes * (1 + sizeTell * lift)) : plainSize;
        for (let j = 0; j < sized.length; j++) {
          const share = valueSize[j] * sigmoid((cut[j] - top) / blur) * (1 - trap);
          out[sized[j].i * n + k] += share;
          betting += share;
        }
        const rest = 1 - betting;
        if (strength.draw[c] >= STRONG_DRAW[street]) {
          for (let j = 0; j < sized.length; j++) out[sized[j].i * n + k] += rest * semi * plainSize[j];
          betting += rest * semi;
        } else if (strength.eff[c] < WEAK[street]) {
          for (let j = 0; j < sized.length; j++) {
            out[sized[j].i * n + k] += rest * bluffRate * bluffSize[j];
            betting += rest * bluffRate * bluffSize[j];
          }
        }
      }
      if (check >= 0) out[check * n + k] += Math.max(0, 1 - betting);
    }
  }

  // Random play on top (drunk or tilted players; next to none otherwise: a raise that's the top 1% of a range
  // would be mostly noise with more), then every hand's row sums to 1.
  const random = clamp((params.noise - 0.18) * 1.5, 0.0001, 0.3);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let a = 0; a < A; a++) sum += out[a * n + k];
    for (let a = 0; a < A; a++) out[a * n + k] = (1 - random) * (sum > 0 ? out[a * n + k] / sum : 1 / A) + random / A;
  }
  return out;
}
