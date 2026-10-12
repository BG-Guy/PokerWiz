// Player models: how a player who isn't assumed to play GTO plays, built from their profile (a tendency such
// as Nit, Calling station, Maniac or Drunk, plus a skill level; coach/profiles.js).
//
// A model has:
//   weight     how much of each decision follows the tendency rather than GTO (1 - skill, so a pro is barely
//              moved and a beginner almost entirely)
//   params     modelParams(profile): looseness, aggression, folding, bluffing, noise ...
//   postflop   policy(node, list): the tendency's strategy at a solve decision (players/policy.js); the solver
//              mixes it in, and everyone else's strategy becomes the best answer to it
//   preflop    strategy(node, strategy, classes): the chart's strategy at a preflop node bent toward the
//              tendency (wider or tighter, more calls or more raises), which also shapes the range they bring
//              to the flop
// No read (an unknown, average player) is no model: that player is GTO.
import { modelParams } from '../../coach/profiles.js';
import { PLAYER_READS } from '../config.js';
import { PREFLOP_BY_CLASS } from '../../coach/preflopTable.js';
import { CLASS_COUNT, CLASS_COMBOS } from '../cards.js';
import { postflopPolicy } from './policy.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const N = CLASS_COUNT;
const RAISES = new Set(['raise', 'allin']);

// Classes from strongest to weakest preflop.
const BY_STRENGTH = Array.from({ length: N }, (_, c) => c).sort((a, b) => PREFLOP_BY_CLASS[a].start - PREFLOP_BY_CLASS[b].start);

// The model for a profile, or null when it reads as an average unknown player (GTO).
export function modelFor(profile) {
  if (!profile || (profile.preset === 'unknown' && (profile.level ?? 'regular') === 'regular' && !(profile.tilt > 0))) return null;
  const params = modelParams(profile);
  const weight = clamp(1 - params.skill, 0.05, 0.95);
  return {
    weight,
    params,
    policy: (node, list) => postflopPolicy(params, node, list),
    preflop: (node, strategy) => preflopStrategy(params, weight, node, strategy),
  };
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

// The chart's strategy at a preflop node (Float32Array(actions x 169)) bent toward the tendency. The share of
// hands played moves by widthMult (strongest hands first), and among them the share raised moves toward the
// profile's raise ratio; then it's mixed with the chart by the model's weight.
export function preflopStrategy(params, weight, node, strategy) {
  const A = node.actions.length;
  const fold = node.actions.findIndex((a) => a.type === 'fold');
  if (fold < 0) return strategy; // checking in the big blind: nothing to bend
  const call = node.actions.findIndex((a) => a.type === 'call' || a.type === 'check');
  const raises = node.actions.map((a, i) => (RAISES.has(a.type) ? i : -1)).filter((i) => i >= 0);

  // How much the chart plays here (combo-weighted), and how much this player plays instead.
  let played = 0;
  let all = 0;
  for (let c = 0; c < N; c++) {
    played += CLASS_COMBOS[c] * (1 - strategy[fold * N + c]);
    all += CLASS_COMBOS[c];
  }
  const target = clamp((played / all) * params.widthMult, 0.01, 0.98) * all;
  const raiseShare = params.pfrRatio;

  const out = new Float32Array(A * N);
  let seen = 0;
  for (const c of BY_STRENGTH) {
    // Play the strongest hands until the target is reached (a soft edge of a few percent of the range).
    const playHand = clamp((target - seen) / (0.04 * all) + 0.5, 0, 1);
    seen += CLASS_COMBOS[c];
    const chartRaise = raises.reduce((s, i) => s + strategy[i * N + c], 0);
    const chartPlay = 1 - strategy[fold * N + c];
    const raiseOfPlay = chartPlay > 1e-6 ? chartRaise / chartPlay : raises.length ? 0.5 : 0;
    const raising = raises.length ? playHand * clamp(0.5 * raiseOfPlay + 0.5 * raiseShare, 0, 1) : 0;
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
