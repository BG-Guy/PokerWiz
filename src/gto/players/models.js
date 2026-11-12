// Player models: how a player who isn't assumed to play GTO plays, built from their profile (a tendency such
// as Nit, Calling station, Maniac or Drunk, plus a skill level; coach/profiles.js).
//
// A model has:
//   weight     how much of each decision follows the tendency rather than GTO: almost all of it for a
//              beginner, 95% for a recreational player, three quarters for a regular, under half for a
//              strong regular, a tenth for a pro (see WEIGHT)
//   params     modelParams(profile): looseness, aggression, folding, bluffing, noise ...
//   postflop   policy(node, list): the tendency's strategy at a solve decision (players/policy.js); the solver
//              mixes it with the player's GTO strategy, and everyone else's strategy becomes the best answer
//              to that mix
//   preflop    strategy(node, strategy, classes): the chart's strategy at a preflop node bent toward the
//              tendency (wider or tighter, more calls or more raises), which also shapes the range they bring
//              to the flop
// No read (an unknown, average player) is no model: that player is GTO.
import { modelParams, describeProfile, defaultProfile } from '../../coach/profiles.js';
import { PLAYER_READS } from '../config.js';
import { PREFLOP_BY_CLASS } from '../../coach/preflopTable.js';
import { CLASS_COUNT, CLASS_COMBOS } from '../cards.js';
import { postflopPolicy } from './policy.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const N = CLASS_COUNT;
const RAISES = new Set(['raise', 'allin']);

// Classes from strongest to weakest preflop.
const BY_STRENGTH = Array.from({ length: N }, (_, c) => c).sort((a, b) => PREFLOP_BY_CLASS[a].start - PREFLOP_BY_CLASS[b].start);

// How much of a player's play is their tendency: 1 - skill^WEIGHT. With 1 (the first version) a recreational
// player was 22% GTO and a regular half, and the GTO share has plays no such player makes (a balanced share of
// big bluffs, top pair jammed for protection, every strong draw raised) that drowned out the read.
const WEIGHT = 2;
// Facing a raise, the top share of hands that re-raises shrinks by this much with every raise already in
// (a 3-bet range of 5%: a 4-bet range of about 2%, QQ+ and AK).
const RERAISE_STEP = 0.45;
// The share of hands an average player plays (coach/profiles.js: an unknown player's VPIP).
const AVERAGE_VPIP = 0.24;

// The model for a profile, or null when it reads as an average unknown player (GTO).
export function modelFor(profile) {
  if (!profile || (profile.preset === 'unknown' && (profile.level ?? 'regular') === 'regular' && !(profile.tilt > 0))) return null;
  const params = modelParams(profile);
  const weight = clamp(1 - params.skill ** WEIGHT, 0.05, 0.97);
  return {
    weight,
    params,
    policy: (node, list) => postflopPolicy(params, node, list),
    preflop: (node, strategy) => preflopStrategy(params, weight, node, strategy),
    // How often each hand class is played at all where this node's strategy is the chart's (169 shares): the
    // range a player limps with from a seat the tree only opens or folds from.
    played: (node, strategy) => preflopPlayed(params, weight, node, strategy),
  };
}

// How a typical player with no read plays a postflop decision (an average regular's tendencies): what narrows
// the ranges on a street that can't be solved (postflop/unsolved.js).
const TYPICAL = modelParams(defaultProfile());
export const typicalPolicy = (node, list) => postflopPolicy(TYPICAL, node, list);

// How a player reads in words ("Calling station · Rec"), or null when they play GTO (no read, or reads are off).
export function readLabel(profile) {
  return PLAYER_READS && modelFor(profile) ? describeProfile(profile).label : null;
}

// Models for the opponents who have a read: { seat: model } (nothing while PLAYER_READS is off, so every seat
// plays GTO). players: [{ seat, role, profile }].
export function readModels(players) {
  if (!PLAYER_READS) return {};
  const out = {};
  for (const p of players) {
    if (p.role === 'hero') continue;
    const model = modelFor(p.profile);
    if (model) out[p.seat] = model;
  }
  return out;
}

// The chart's strategy at a preflop node (Float32Array(actions x 169)) bent toward the tendency, then mixed
// with the chart by the model's weight.
//   how many hands   the share played moves by widthMult, strongest hands first: a tighter player plays that
//                    share of the chart's hands, a looser one folds that much less of what the chart folds (so
//                    a wide defence, like the big blind's, can't go past every hand)
//   opening          among them, the share raised moves toward the profile's raise ratio
//   facing a raise   the top `threeBet` of all hands re-raises (less with every raise already in) and the rest
//                    of the hands played call: a passive player's flatting range holds the hands a solver
//                    3-bets (AQ, AT in the blinds, the big pairs now and then)
export function preflopStrategy(params, weight, node, strategy) {
  const A = node.actions.length;
  const fold = node.actions.findIndex((a) => a.type === 'fold');
  if (fold < 0) return strategy; // checking in the big blind: nothing to bend
  const call = node.actions.findIndex((a) => a.type === 'call' || a.type === 'check');
  const raises = node.actions.map((a, i) => (RAISES.has(a.type) ? i : -1)).filter((i) => i >= 0);

  const level = node.level ?? 0; // raises so far
  const { target, all } = widthAt(params, strategy, fold, level);
  const raiseShare = params.pfrRatio;
  const reraise = params.threeBet * RERAISE_STEP ** Math.max(0, level - 1) * all;
  // Passive players sometimes just call with a hand worth a re-raise.
  const flatIt = clamp(0.35 - 0.1 * params.aggression, 0, 0.25);

  const out = new Float32Array(A * N);
  let seen = 0;
  for (const c of BY_STRENGTH) {
    const playHand = playShare(target, seen, all);
    const reraiseHand = clamp((reraise - seen) / (0.01 * all) + 0.5, 0, 1);
    seen += CLASS_COMBOS[c];
    const chartRaise = raises.reduce((s, i) => s + strategy[i * N + c], 0);
    const chartPlay = 1 - strategy[fold * N + c];
    const raiseOfPlay = chartPlay > 1e-6 ? chartRaise / chartPlay : raises.length ? 0.5 : 0;
    const raiseOften = level === 0 ? clamp(0.5 * raiseOfPlay + 0.5 * raiseShare, 0, 1) : reraiseHand * (1 - flatIt);
    const raising = raises.length ? playHand * raiseOften : 0;
    const calling = call >= 0 ? playHand - raising : 0;
    out[fold * N + c] = 1 - raising - calling;
    if (call >= 0) out[call * N + c] = calling;
    // Raises keep the chart's split between sizes (or the first size).
    raises.forEach((i) => {
      out[i * N + c] = chartRaise > 1e-6 ? raising * (strategy[i * N + c] / chartRaise) : i === raises[0] ? raising : 0;
    });
  }
  for (let i = 0; i < A * N; i++) out[i] = (1 - weight) * strategy[i] + weight * out[i];
  return out;
}

// How many combos a chart strategy plays (everything but `fold`), and how many this player plays instead
// (`target`), of `all`. level: raises so far at this node.
//   tighter than average   that share of what the chart plays
//   looser                 folds that much less of what the chart folds, and at least the chart's hands plus
//                          the extra hands they play overall (their VPIP above an average player's). The
//                          second matters where the chart is tight: it calls a raise cold with 6% of hands,
//                          a loose-passive player with about a quarter. Half as much for each raise after the
//                          first.
function widthAt(params, strategy, fold, level = 0) {
  let played = 0;
  let all = 0;
  for (let c = 0; c < N; c++) {
    played += CLASS_COMBOS[c] * (1 - strategy[fold * N + c]);
    all += CLASS_COMBOS[c];
  }
  const share = played / all;
  const extra = (params.vpip - AVERAGE_VPIP) * 0.5 ** Math.max(0, level - 1);
  const wider = params.widthMult <= 1 ? share * params.widthMult : Math.max(1 - (1 - share) ** params.widthMult, share + extra);
  return { target: clamp(wider, 0.01, 0.98) * all, all };
}
// A hand is played when the strongest hands before it (`seen` combos) haven't filled the target yet, with a
// soft edge of a few percent of all hands.
const playShare = (target, seen, all) => clamp((target - seen) / (0.04 * all) + 0.5, 0, 1);

// How often each hand class is played (not folded) at a node by this player: Float32Array(169).
export function preflopPlayed(params, weight, node, strategy) {
  const fold = node.actions.findIndex((a) => a.type === 'fold');
  const out = new Float32Array(N).fill(1);
  if (fold < 0) return out;
  const { target, all } = widthAt(params, strategy, fold, node.level ?? 0);
  let seen = 0;
  for (const c of BY_STRENGTH) {
    out[c] = (1 - weight) * (1 - strategy[fold * N + c]) + weight * playShare(target, seen, all);
    seen += CLASS_COMBOS[c];
  }
  return out;
}
