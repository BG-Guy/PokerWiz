// Grading one hero decision.
//
// Postflop (and preflop spots where stacks go in): pure expected value. For every option the hero had,
//   fold   = 0 (baseline)
//   check  = equity * realization * pot                                      + future value / 2
//   call   = equity * realization * (pot + call) - call                      + future value
//   bet/raise to X = P(everyone folds) * pot
//                  + P(called) * (equity vs the calling range * realization * pot-when-called - chips added
//                               + future value)
// where the villains' ranges come from their actions so far (see analyzeHand) and how often they fold
// comes from pot odds vs the range they put the hero on, bent by their traits (postflopModel).
// Realization: in position ~100%, out of position ~86-92%, river 100% (equity-realization research).
// Future value: with streets to come, a hand that's ahead wins more later and a hand that's behind loses
// more (implied / reverse implied odds): (equity - 0.5) * 2 * min(stack behind, pot) * street factor.
//
// Preflop (normal spots): solver-style charts by position, adjusted to the opener's looseness. The score
// depends on how far the hand sits from the boundary of the right action.
import { getOptions, currentPlayer } from '../utils/handEngine.js';
import { COMBOS, classOf, CLASS_NAMES } from './combos.js';
import { preflopSituation, preflopAdvice } from './preflopModel.js';
import { continuingRange, bettingSplit } from './postflopModel.js';
import { equityVsRanges } from './equity.js';
import { scoreFromLoss, scoreFromDistance, gradeOf } from './grading.js';
import { isInPosition } from './replay.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Share of the remaining stack/pot that tends to go in on later streets.
const FUTURE_FACTOR = { Preflop: 0.35, Flop: 0.35, Turn: 0.2, River: 0 };
function futureValue(street, equity, pot, stackBehind) {
  if (stackBehind <= 0) return 0;
  return (equity - 0.5) * 2 * Math.min(stackBehind, pot) * (FUTURE_FACTOR[street] ?? 0);
}

// Share of raw equity a hand actually wins, by street, position and number of opponents.
export function realization(street, inPosition, opponents) {
  if (street === 'River') return 1;
  let r = street === 'Turn' ? (inPosition ? 1 : 0.92) : inPosition ? 1.02 : 0.86;
  if (street === 'Preflop') r = inPosition ? 1 : 0.82;
  return r * 0.96 ** Math.max(0, opponents - 1);
}

// The hero's logged action as { kind: fold|check|call|raise, to?, allIn? }.
function normalizeAction(type, amount, opts, state) {
  if (type === 'allin') {
    return opts.maxTo <= state.currentBet ? { kind: 'call' } : { kind: 'raise', to: opts.maxTo, allIn: true };
  }
  if (type === 'bet' || type === 'raise') {
    const to = Math.min(amount, opts.maxTo);
    return { kind: 'raise', to, allIn: to >= opts.maxTo };
  }
  return { kind: type };
}

// Readable label for an option.
export function optionLabel(option, state) {
  const dollars = (n) => `$${round2(n).toLocaleString('en-US')}`;
  if (option.kind === 'fold') return 'Fold';
  if (option.kind === 'check') return 'Check';
  if (option.kind === 'call') return `Call ${dollars(option.amount)}`;
  if (option.allIn) return `All in ${dollars(option.to)}`;
  if (state.currentBet === 0) {
    const share = Math.round(((option.to) / state.pot) * 100);
    return `Bet ${dollars(option.to)} (${share}% pot)`;
  }
  return `Raise to ${dollars(option.to)}`;
}

// Bet/raise sizes worth comparing: standard fractions of the pot (33% to 150%), plus all-in when the stack
// is shallow enough that a shove is a normal size (about 2x the pot or less). Giant overbet shoves aren't
// suggested; if you made one, your exact size is still valued (see matchActual).
function candidateSizes(state, opts) {
  const snap = (x) => round2(Math.max(opts.minTo, Math.min(opts.maxTo, Math.round(x / state.sb) * state.sb)));
  const sizes = [];
  let largestNormal;
  if (opts.isOpening) {
    for (const f of [0.33, 0.5, 0.75, 1, 1.5]) sizes.push(snap(state.pot * f));
    largestNormal = state.pot * 2;
  } else {
    // Raise-to amounts: current bet plus a fraction of the pot after calling (1.0 = pot-sized raise).
    for (const f of [0.6, 0.85, 1.1]) sizes.push(snap(state.currentBet + f * (state.pot + opts.toCall)));
    largestNormal = state.currentBet + 2 * (state.pot + opts.toCall);
  }
  if (opts.maxTo <= largestNormal * 1.1) sizes.push(opts.maxTo);
  return [...new Set(sizes)].filter((to) => to > state.currentBet).sort((a, b) => a - b);
}

// How each still-active villain looks at this moment (for the report's range grids).
export function villainReads(villains, state) {
  return villains
    .filter((v) => !state.players.find((p) => p.seat === v.seat)?.folded)
    .map((v) => {
      const grid = new Float64Array(169);
      const counts = new Float64Array(169);
      let total = 0;
      for (let i = 0; i < v.weights.length; i++) {
        const cls = COMBOS[i].cls;
        grid[cls] += v.weights[i];
        counts[cls] += 1;
        total += v.weights[i];
      }
      const averages = Array.from(grid, (sum, cls) => (counts[cls] ? sum / counts[cls] : 0));
      const heaviest = Math.max(...v.weights, 1e-300);
      const peak = Math.max(...averages, 1e-12);
      const normalized = averages.map((a) => round2(a / peak));
      const top = averages
        .map((a, cls) => ({ cls, a }))
        .sort((x, y) => y.a - x.a)
        .slice(0, 8)
        .filter((x) => x.a > 0)
        .map((x) => CLASS_NAMES[x.cls]);
      // Width: the range's size relative to a full range, judged by shape (the likeliest combo counts as 1).
      return { seat: v.seat, name: v.name, position: v.position, label: v.label, width: round2(total / heaviest / 1326), grid: normalized, top };
    });
}

// ----- Postflop -----

export function evaluatePostflop({ state, street, heroCards, board, villains, strengths, heroSkill, iterations, random }) {
  const opts = getOptions(state);
  const hero = currentPlayer(state);
  const playerOf = (seat) => state.players.find((p) => p.seat === seat);
  const active = villains.filter((v) => !playerOf(v.seat).folded);
  const inPosition = isInPosition(state, hero.seat);
  const R = realization(street, inPosition, active.length);
  const pot = state.pot;
  const toCall = opts.toCall;
  const potRef = pot + toCall;

  const equityNow = equityVsRanges({ hero: heroCards, board, ranges: active.map((v) => v.weights), iterations, random }).equity ?? 0;
  const heroBehind = hero.stack - hero.invested;
  // Most chips any active villain still has behind (caps how much more can go in).
  const villainBehind = (extra = 0) =>
    Math.max(0, ...active.filter((v) => !playerOf(v.seat).allIn).map((v) => playerOf(v.seat).stack - playerOf(v.seat).invested - extra));

  // Value of betting/raising to `to`.
  const betOption = (to) => {
    const heroAdd = round2(to - hero.streetBet);
    const facing = active.filter((v) => !playerOf(v.seat).allIn);
    const alreadyAllIn = active.filter((v) => playerOf(v.seat).allIn);
    let pFoldAll = 1;
    let expectedCallChips = 0;
    let heroRisk = 0; // chips of the bet that can actually be called (anything beyond comes back)
    const continuing = [];
    for (const v of facing) {
      const vp = playerOf(v.seat);
      const callAmount = Math.min(to - vp.streetBet, vp.stack - vp.invested);
      const matched = Math.min(heroAdd, callAmount + vp.streetBet - hero.streetBet);
      heroRisk = Math.max(heroRisk, matched);
      const cont = continuingRange({
        weights: v.weights,
        strengths,
        // Their price: call to win the pot plus the part of your bet they match.
        required: callAmount / (pot + matched + callAmount),
        // What the size represents: a bet relative to the pot; a raise's increment relative to the pot after calling.
        sizeRatio: opts.isOpening ? heroAdd / Math.max(pot, 1e-9) : (to - state.currentBet) / Math.max(pot + opts.toCall, 1e-9),
        defenders: facing.length,
        params: v.params,
        isRaise: !opts.isOpening,
        river: street === 'River',
      });
      pFoldAll *= 1 - cont.share;
      expectedCallChips += cont.share * callAmount;
      continuing.push(cont.weights);
    }
    if (facing.length === 0) heroRisk = heroAdd;
    if (facing.length === 0) pFoldAll = 0;
    const called = equityVsRanges({
      hero: heroCards,
      board,
      ranges: [...continuing, ...alreadyAllIn.map((v) => v.weights)],
      iterations: Math.round(iterations * 0.7),
      random,
    }).equity;
    const equityWhenCalled = called ?? equityNow;
    const notAllFold = 1 - pFoldAll;
    const calledPot = pot + heroRisk + (notAllFold > 0 ? expectedCallChips / notAllFold : 0);
    const allIn = to >= opts.maxTo - 0.001;
    const Rb = street === 'River' || allIn ? 1 : R;
    const behind = Math.min(heroBehind - heroRisk, villainBehind(to - hero.streetBet));
    const later = futureValue(street, equityWhenCalled, calledPot, behind);
    const ev = pFoldAll * pot + notAllFold * (equityWhenCalled * Rb * calledPot - heroRisk + later);
    return { kind: 'raise', to, allIn, ev: round2(ev), foldEquity: pFoldAll, equityWhenCalled };
  };

  const options = [];
  if (toCall > 0) {
    options.push({ kind: 'fold', ev: 0 });
    const noMoreBetting = opts.callIsAllIn || active.every((v) => playerOf(v.seat).allIn);
    const Rc = street === 'River' || noMoreBetting ? 1 : R;
    const later = noMoreBetting ? 0 : futureValue(street, equityNow, pot + toCall, Math.min(heroBehind - toCall, villainBehind()));
    options.push({ kind: 'call', amount: toCall, ev: round2(equityNow * Rc * (pot + toCall) - toCall + later), equity: equityNow });
  } else {
    // Checking: if the pot stays checked you realize your equity; heads-up with the villain still to act,
    // they may bet after your check, so look one step ahead (trapping and bluff-catching value).
    let checkEv = equityNow * R * pot + futureValue(street, equityNow, pot, Math.min(heroBehind, villainBehind())) / 2;
    let lookahead = null;
    const toAct = active.filter((v) => !playerOf(v.seat).allIn && state.queue.includes(v.seat));
    if (active.length === 1 && toAct.length === 1) {
      const v = toAct[0];
      const vp = playerOf(v.seat);
      const betSize = round2(Math.min(0.6 * pot, vp.stack - vp.invested, heroBehind));
      const split = bettingSplit({ weights: v.weights, strengths, params: v.params, sizeRatio: 0.6 });
      if (split.betShare > 0.02 && betSize > 0) {
        const subIterations = Math.round(iterations * 0.5);
        const eqVsBet = equityVsRanges({ hero: heroCards, board, ranges: [split.bet], iterations: subIterations, random }).equity ?? equityNow;
        const eqVsCheck = equityVsRanges({ hero: heroCards, board, ranges: [split.check], iterations: subIterations, random }).equity ?? equityNow;
        const Rcall = street === 'River' ? 1 : R;
        const facingPot = pot + 2 * betSize;
        const callValue = eqVsBet * Rcall * facingPot - betSize + futureValue(street, eqVsBet, facingPot, Math.min(heroBehind - betSize, villainBehind(betSize)));
        const ifTheyBet = Math.max(0, callValue); // you'd fold if calling loses
        const ifTheyCheck = eqVsCheck * R * pot + futureValue(street, eqVsCheck, pot, Math.min(heroBehind, villainBehind())) / 2;
        checkEv = split.betShare * ifTheyBet + (1 - split.betShare) * ifTheyCheck;
        lookahead = { theyBet: split.betShare, betSize, equityVsBet: eqVsBet };
      }
    }
    options.push({ kind: 'check', ev: round2(checkEv), equity: equityNow, lookahead });
  }
  if (opts.canRaise) for (const to of candidateSizes(state, opts)) options.push(betOption(to));

  return { opts, options, equityNow, potRef, inPosition, R, betOption };
}

// Pick the hero's option from the list (adding the exact bet size if it wasn't one of the candidates).
function matchActual(actual, options, betOption) {
  if (actual.kind !== 'raise') return options.find((o) => o.kind === actual.kind) ?? options[0];
  const same = options.find((o) => o.kind === 'raise' && Math.abs(o.to - actual.to) < 0.01);
  if (same) return same;
  const exact = betOption(actual.to);
  options.push(exact);
  options.sort((a, b) => (a.kind === 'raise' && b.kind === 'raise' ? a.to - b.to : 0));
  return exact;
}

export function gradePostflop({ state, street, type, amount, heroCards, board, villains, strengths, heroSkill, iterations, random }) {
  const analysis = evaluatePostflop({ state, street, heroCards, board, villains, strengths, heroSkill, iterations, random });
  const actual = matchActual(normalizeAction(type, amount, analysis.opts, state), analysis.options, analysis.betOption);
  const best = analysis.options.reduce((a, b) => (b.ev > a.ev ? b : a));
  const evLoss = Math.max(0, best.ev - actual.ev);
  const score = actual === best ? 100 : scoreFromLoss(evLoss, analysis.potRef, heroSkill, state.bb);
  const options = analysis.options.map((o) => ({
    ...o,
    label: optionLabel(o, state),
    isActual: o === actual,
    isBest: o === best,
  }));
  return {
    kind: 'ev',
    options,
    actual: options.find((o) => o.isActual),
    best: options.find((o) => o.isBest),
    evLoss: round2(evLoss),
    score,
    grade: gradeOf(score),
    equity: analysis.equityNow,
    potRef: analysis.potRef,
    toCall: analysis.opts.toCall,
    inPosition: analysis.inPosition,
    realization: analysis.R,
  };
}

// ----- Preflop -----

export function gradePreflop({ state, type, amount, heroCards, board, villains, actionsSoFar, tableSize, heroSkill, iterations, random }) {
  const opts = getOptions(state);
  const hero = currentPlayer(state);
  const situation = preflopSituation(state, actionsSoFar, hero.seat);
  const heroClass = classOf(heroCards[0], heroCards[1]);
  const opener = villains.find((v) => v.seat === situation.openerSeat);
  const openerWidth = opener ? opener.params.widthMult : 1;
  const advice = preflopAdvice({ position: hero.position, tableSize, situation, heroClass, openerWidth });
  const playerOf = (seat) => state.players.find((p) => p.seat === seat);
  const active = villains.filter((v) => !playerOf(v.seat).folded);
  const equityNow =
    equityVsRanges({ hero: heroCards, board, ranges: active.map((v) => v.weights), iterations: Math.round(iterations * 0.6), random }).equity ?? 0;
  const actual = normalizeAction(type, amount, opts, state);
  const potRef = state.pot + opts.toCall;

  // Stacks are going in: this is pure math, equity vs the shover's range against the price.
  if (situation.facingAllIn || opts.callIsAllIn) {
    const options = [
      { kind: 'fold', ev: 0 },
      { kind: 'call', amount: opts.toCall, ev: round2(equityNow * (state.pot + opts.toCall) - opts.toCall), equity: equityNow },
    ];
    const picked = options.find((o) => o.kind === (actual.kind === 'raise' ? 'call' : actual.kind)) ?? options[0];
    const best = options.reduce((a, b) => (b.ev > a.ev ? b : a));
    const evLoss = Math.max(0, best.ev - picked.ev);
    const score = picked === best ? 100 : scoreFromLoss(evLoss, potRef, heroSkill, state.bb);
    const labeled = options.map((o) => ({ ...o, label: optionLabel(o, state), isActual: o === picked, isBest: o === best }));
    return {
      kind: 'ev',
      options: labeled,
      actual: labeled.find((o) => o.isActual),
      best: labeled.find((o) => o.isBest),
      evLoss: round2(evLoss),
      score,
      grade: gradeOf(score),
      equity: equityNow,
      potRef,
      toCall: opts.toCall,
      situation,
      heroClass: CLASS_NAMES[heroClass],
    };
  }

  // Chart spot: how far is the hand from the edge of the action the hero took?
  const t = advice.thresholds;
  const top = advice.handTop;
  const did = actual.kind === 'raise' ? 'raise' : actual.kind;
  const limped = did === 'call' && t.kind === 'unopened';
  let distance = 0;
  if (did !== advice.best) {
    // Folding a hand that should play is the costliest preflop error (and folding a premium is a disaster).
    if (did === 'fold') distance = 3 * Math.max(0, (advice.best === 'raise' ? t.raise : t.play) - top) + (top < 0.03 ? 0.15 : 0);
    else if (did === 'check') distance = 0.5 * Math.max(0, t.raise - top);
    else if (limped) distance = advice.best === 'raise' ? 0.03 + 0.5 * Math.max(0, t.raise - top) : Math.max(0, top - t.play);
    else if (did === 'call' && advice.best === 'raise') distance = 0.6 * Math.max(0, t.raise - top);
    else if (did === 'call') distance = Math.max(0, top - t.play);
    else if (did === 'raise' && advice.best === 'call') distance = 0.7 * Math.max(0, top - t.raise);
    else if (did === 'raise') distance = 0.02 + Math.max(0, top - Math.max(t.play, t.raise));
  }
  // Open-shoving a deep stack risks a lot to win little: a small penalty unless the hand is a premium.
  const deepShove = actual.allIn && situation.stackBB > 40 && top > 0.03;
  let score = did === advice.best ? 100 : scoreFromDistance(distance);
  if (deepShove) score = Math.round(score * 0.85);

  return {
    kind: 'chart',
    advice,
    thresholds: t,
    handTop: top,
    did,
    limped,
    deepShove,
    score,
    grade: gradeOf(score),
    equity: equityNow,
    potRef,
    toCall: opts.toCall,
    situation,
    heroClass: CLASS_NAMES[heroClass],
    actualLabel: optionLabel(actual.kind === 'raise' ? actual : { kind: actual.kind, amount: opts.toCall }, state),
  };
}
