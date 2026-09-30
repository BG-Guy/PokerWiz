// Postflop behavior model: how likely a player is to check, bet, fold, call or raise with each combo,
// given its effective strength (see boardStrength.js), the price they face, and their profile.
//
// The math core, for a player facing a bet:
//   required equity = call / (pot after the bet + call)   (pot odds)
//   They compare it with their equity against the range they put the bettor on: a value region that gets
//   stronger as the bet gets bigger, plus some bluffs. Balanced play would make them exactly indifferent
//   (bluff share = required equity); real players assume fewer bluffs than that (people under-bluff big
//   bets), so they continue only with hands that beat enough of the bettor's value range.
//   foldMult > 1 assumes even fewer bluffs (nits fold more), < 1 assumes more (stations call more).
// When nobody has bet: players who are not the previous aggressor rarely lead out ("donk bet"); everyone
// checks to the raiser most of the time. Aggression sets how thin they value bet and how often they raise;
// bluffMult scales bluffs; noise blurs every threshold (amateurs are sloppy, pros are sharp).
import { COMBO_COUNT } from './combos.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Where a bet's value region starts, by size (bet / pot): small bets can be medium-strength hands,
// big bets and overbets represent the top of a range (polarization). 1/3 pot ~0.66, pot ~0.80, 2x pot ~0.90.
export function valueRegionStart(sizeRatio) {
  return 0.97 - 0.42 * Math.exp(-0.9 * Math.max(0, sizeRatio));
}

// Softness of decision edges, in strength units.
const softnessOf = (params) => clamp(0.03 + params.noise * 0.45, 0.03, 0.16);

// Near the top of the strength scale hands are packed tightly (top pair ~0.90, sets ~0.98), so an edge up
// there can't be as blurry as one in the middle: nobody calls off a stack with a hand far below the line.
const edgeSoftness = (softness, threshold) => Math.min(softness, (1 - threshold) * 0.35 + 0.005);

// Aggression factor mapped to -0.5 (very passive) ... 1 (maniac); 0 is about a solid regular.
const aggroNorm = (params) => clamp((params.aggression - 1.5) / 3, -0.5, 1);

// Minimum defense frequency (MDF) = pot / (pot + bet); multiway, each defender needs 1 - alpha^(1/n).
// Shown in the report as the theoretical benchmark.
export function mdf({ pot, risk, defenders = 1 }) {
  const alpha = risk / (pot + risk);
  return 1 - alpha ** (1 / Math.max(1, defenders));
}

// Effective strength a player needs to continue against a bet (see the header for the reasoning).
//   required   equity this player needs to call (their price)
//   sizeRatio  the bet (or raise increment) relative to the pot before it: what the size represents
// A raise represents a stronger range than a bet of the same size, so isRaise moves the value region up.
// Before the river (river = false) draws make bets and raises less nutted, so the value region is capped.
export function continueThreshold({ required, sizeRatio, defenders = 1, params, isRaise = false, river = true }) {
  // Where they think the bettor's value hands start: bigger bets and more players = stronger.
  const valueStart = clamp(valueRegionStart(sizeRatio) + 0.03 * (defenders - 1) + (isRaise ? 0.06 : 0), 0.5, river ? 0.985 : 0.93);
  // How many bluffs they believe are in there: fewer than balanced (people under-bluff), but wild
  // overbets (over 2x pot) look more suspicious. Stations believe in more bluffs, nits in fewer.
  const suspicion = 0.75 + 0.15 * clamp((sizeRatio - 1) / 3, 0, 1);
  const bluffBelief = clamp((suspicion * required) / params.foldMult, 0.02, 0.75);
  if (required <= bluffBelief) return 0.3; // they think you bluff enough: anything that beats air calls
  return valueStart + ((1 - valueStart) * (required - bluffBelief)) / (1 - bluffBelief);
}

// Strength cutoff so that `share` of the (weighted) range is at or above it.
export function strengthCutoff(weights, strength, valid, share) {
  const items = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (!valid[i] || weights[i] <= 0) continue;
    items.push(i);
    total += weights[i];
  }
  if (total === 0) return 0.5;
  items.sort((a, b) => strength[b] - strength[a]);
  let acc = 0;
  for (const i of items) {
    acc += weights[i];
    if (acc / total >= share) return strength[i];
  }
  return strength[items[items.length - 1]];
}

// Probabilities for one combo when nobody has bet yet: { bet, check }.
// donk = acting before the previous street's aggressor, who hasn't acted yet (leading into them is rare).
// sizeRatio = the bet's size / pot when known (bigger bets = stronger value hands), else a typical 0.6.
function unopenedProbabilities(eff, draw, params, donk, sizeRatio = 0.6) {
  const s = softnessOf(params);
  const a = aggroNorm(params);
  const valueThreshold = clamp(valueRegionStart(sizeRatio) - 0.1 * a, 0.5, 0.97);
  const valueFrequency = clamp(0.35 + 0.3 * params.aggression, 0.3, 0.95);
  const value = valueFrequency * sigmoid((eff - valueThreshold) / edgeSoftness(s, valueThreshold));
  // Pure bluffs from the bottom of the range, semi-bluffs from draws.
  const airBluff = 0.1 * params.bluffMult * (1 - sigmoid((eff - 0.35) / s));
  const semiBluff = clamp(draw * 1.2, 0, 0.5) * clamp(params.aggression / 2.5, 0.2, 1.4);
  let bet = clamp(value + airBluff + semiBluff, 0.02, 0.98);
  if (donk) bet *= 0.12 + 0.35 * (1 - params.skill); // amateurs donk more than pros
  return { bet, check: 1 - bet };
}

// Probabilities for one combo when facing a bet: { fold, call, raise }. cutoff comes from continueThreshold.
// raiseRatio = the raise increment / pot after calling, when known (all-in check-raises mean the nuts or air).
// crisp < 1 sharpens the call/fold edge (facing a raise, nobody calls off big chunks at random).
function facingBetProbabilities(eff, draw, cutoff, params, raiseRatio = 0.8, crisp = 1) {
  const s = softnessOf(params);
  const a = aggroNorm(params);
  const cont = sigmoid((eff - cutoff) / edgeSoftness(s * crisp, cutoff));
  const raiseThreshold = clamp(valueRegionStart(raiseRatio) + 0.06 - 0.08 * a, 0.72, 0.985);
  const raiseFrequency = clamp(0.15 + 0.2 * params.aggression, 0.1, 0.9);
  // Raises are deliberate: sharper edges than calls, plus semi-bluff raises with draws.
  const raise = clamp(raiseFrequency * sigmoid((eff - raiseThreshold) / edgeSoftness(s * 0.6, raiseThreshold)) + 0.125 * draw * params.bluffMult, 0, cont);
  return { fold: 1 - cont, call: Math.max(0.005, cont - raise), raise: Math.max(0.003, raise) };
}

// Likelihood of the observed action for every combo (Float64Array(1326)).
// context: { facingBet, facingRaise, pot, toCall, defenders, donk, sizeRatio }  (pot includes the bet being
// faced; sizeRatio is the size of the observed bet/raise relative to the pot, when there is one)
export function postflopActionLikelihood({ action, strengths, context, params }) {
  const { eff, draw, valid } = strengths;
  const likelihood = new Float64Array(COMBO_COUNT);

  // Facing a bet: price = call / (pot + call); size = the bet relative to the pot before it.
  const cutoff = context.facingBet
    ? continueThreshold({
        required: context.toCall / (context.pot + context.toCall),
        sizeRatio: context.betRatio ?? context.toCall / Math.max(context.pot - context.toCall, 1e-9),
        defenders: context.defenders,
        params,
        isRaise: context.facingRaise,
        river: strengths.draw.every((d) => d === 0),
      })
    : 0.5;

  for (let i = 0; i < COMBO_COUNT; i++) {
    if (!valid[i]) continue;
    let value;
    if (!context.facingBet) {
      const p = unopenedProbabilities(eff[i], draw[i], params, context.donk, context.sizeRatio);
      value = action === 'check' ? p.check : p.bet;
    } else {
      const p = facingBetProbabilities(eff[i], draw[i], cutoff, params, context.sizeRatio, context.facingRaise ? 0.6 : 1);
      value = action === 'fold' ? p.fold : action === 'call' ? p.call : p.raise;
    }
    likelihood[i] = value;
  }
  return likelihood;
}

// Weights of the part of a range that continues when the hero bets or raises (used for EV math).
// required / sizeRatio as in continueThreshold. Returns { weights, share } (share = weighted fraction that continues).
export function continuingRange({ weights, strengths, required, sizeRatio, defenders, params, isRaise = false, river = true }) {
  const { eff, draw, valid } = strengths;
  const cutoff = continueThreshold({ required, sizeRatio, defenders, params, isRaise, river });
  const next = new Float64Array(COMBO_COUNT);
  let before = 0;
  let after = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (!valid[i] || weights[i] <= 0) continue;
    const p = facingBetProbabilities(eff[i], draw[i], cutoff, params, 0.8, isRaise ? 0.6 : 1);
    next[i] = weights[i] * (1 - p.fold);
    before += weights[i];
    after += next[i];
  }
  return { weights: next, share: before > 0 ? after / before : 0 };
}

// How a player's range splits when nobody has bet yet: the weights that would bet and the weights that
// would check, plus the share that bets. sizeRatio = the bet size they'd use relative to the pot.
// Used to value checking: after you check, how often do they bet, and with what?
export function bettingSplit({ weights, strengths, params, sizeRatio = 0.6, donk = false }) {
  const { eff, draw, valid } = strengths;
  const bet = new Float64Array(COMBO_COUNT);
  const check = new Float64Array(COMBO_COUNT);
  let total = 0;
  let betTotal = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (!valid[i] || weights[i] <= 0) continue;
    const p = unopenedProbabilities(eff[i], draw[i], params, donk, sizeRatio);
    bet[i] = weights[i] * p.bet;
    check[i] = weights[i] * p.check;
    total += weights[i];
    betTotal += bet[i];
  }
  return { bet, check, betShare: total > 0 ? betTotal / total : 0 };
}
