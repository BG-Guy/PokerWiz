// Preflop model: baseline ranges by position (from solver-style charts), how each player type widens or
// narrows them, how a villain's preflop action reshapes their range, and what the hero "should" do.
// Ranges are built from the preflop table: "top X%" = every class whose slice of the 1326 combos starts
// below X. Edges are soft (a logistic curve) so amateurs blur around the boundary and pros stay sharp.
//
// Two uses, one model. The coach reads ranges with it: wide, soft edges are fine there (they encode what we
// don't know about a player), and the postflop grading is calibrated on those ranges. Practice bots play
// hands with it (asPlayer), where a soft edge turns into nonsense decisions, so they get sharper rules:
// premiums are never folded, players who raise everything they play don't limp, and only passive players
// slow-play much. Real per-hand preflop charts would let both uses share one set of numbers.
import { PREFLOP_BY_CLASS } from './preflopTable.js';
import { COMBOS, COMBO_COUNT } from './combos.js';

// Raise-first-in (open) share of all hands, by table size and position.
// 6-max: ~15% UTG to ~45% BTN (solver charts); 9-max early seats are tighter.
const RFI = {
  6: { UTG: 0.15, HJ: 0.21, CO: 0.28, BTN: 0.45, SB: 0.38, BB: 0 },
  9: { UTG: 0.1, 'UTG+1': 0.11, MP: 0.13, LJ: 0.16, HJ: 0.21, CO: 0.28, BTN: 0.45, SB: 0.38, BB: 0 },
};

// How "early" an opener is, for defense tables: early / middle / cutoff / button / small blind.
function openerGroup(position) {
  if (['UTG', 'UTG+1', 'MP'].includes(position)) return 'early';
  if (['LJ', 'HJ'].includes(position)) return 'middle';
  if (position === 'CO') return 'cutoff';
  if (position === 'BTN') return 'button';
  return 'small';
}

// Total defense (call + 3-bet) against a single open, as a share of all hands.
// Big blind vs button ~55% (2.5x open); small blind and in-position players are mostly 3-bet-or-fold.
const DEFEND = {
  BB: { early: 0.3, middle: 0.36, cutoff: 0.44, button: 0.55, small: 0.6 },
  SB: { early: 0.09, middle: 0.11, cutoff: 0.14, button: 0.17, small: 0.17 },
  other: { early: 0.08, middle: 0.1, cutoff: 0.15, button: 0.15, small: 0.15 },
};

// 3-bet share of all hands against a single open. Big blind vs button ~11-13%.
const THREE_BET = {
  BB: { early: 0.045, middle: 0.06, cutoff: 0.08, button: 0.115, small: 0.14 },
  SB: { early: 0.06, middle: 0.075, cutoff: 0.095, button: 0.125, small: 0.125 },
  other: { early: 0.04, middle: 0.055, cutoff: 0.075, button: 0.08, small: 0.08 },
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function rfiShare(position, tableSize = 6) {
  return (RFI[tableSize] ?? RFI[6])[position] ?? 0.2;
}

// Soft "is this class inside the top x of hands" weight, 0..1. softness grows with the player's noise.
// asPlayer: on the strong side the blur is measured in ratios (log scale, which matches the linear blur at the
// edge), so a hand ten times better than the edge is all but certain to be in. With the linear blur alone even
// aces top out around 92% in: harmless for reading a range, but a bot playing from it would fold them.
function softTop(cls, x, softness, asPlayer = false) {
  const entry = PREFLOP_BY_CLASS[cls];
  const mid = (entry.start + entry.end) / 2;
  const width = Math.max(0.004, softness * Math.max(x, 0.02));
  let z = (x - mid) / width;
  if (asPlayer && mid < x) z = Math.max(z, (Math.log(x / mid) * x) / width);
  return 1 / (1 + Math.exp(-z));
}

const isSuitedClass = (cls) => Math.floor(cls / 13) < cls % 13;

// Hands a practice bot never folds to one raise or a 3-bet, and always raises first in or re-raises against
// one raise (passive players still slow-play some; see the trap share in preflopActionLikelihood).
const PREMIUMS = new Set(['AA', 'KK', 'QQ', 'AKs', 'AKo']);

// Preflop situation for the player about to act, read from the betting engine state and the actions so far.
//   raises:       1 = nobody raised yet (only the big blind), 2 = facing an open, 3 = facing a 3-bet, ...
//   openerPosition, lastRaiserSeat, limpers, facingAllIn
export function preflopSituation(state, actions, actorSeat) {
  const actor = state.players.find((p) => p.seat === actorSeat);
  const raisers = actions.filter((a) => a.verb.includes('raise') || a.verb.includes('-bets') || a.verb === 'all in' || a.verb === 'bets');
  const opener = raisers[0];
  const openerPlayer = opener ? state.players.find((p) => (p.role === 'hero' ? 'Hero' : p.position) === opener.actor) : null;
  const lastRaiser = raisers.at(-1);
  const lastRaiserPlayer = lastRaiser ? state.players.find((p) => (p.role === 'hero' ? 'Hero' : p.position) === lastRaiser.actor) : null;
  const limpers = raisers.length === 0 ? actions.filter((a) => a.verb === 'calls').length : 0;
  const facingAllIn = state.players.some((p) => p.seat !== actorSeat && p.allIn && !p.folded);
  const remaining = actor.stack - actor.invested;
  const toCall = Math.min(state.currentBet - actor.streetBet, remaining);
  // How the actor is in the hand so far: the opener, a player who already called, or not yet at all ("cold";
  // blinds count as cold, their money went in by force).
  const actorName = actor.role === 'hero' ? 'Hero' : actor.position;
  const involvement =
    openerPlayer?.seat === actorSeat ? 'opener' : actions.some((a) => a.actor === actorName && a.verb === 'calls') ? 'caller' : 'cold';
  return {
    raises: state.raises,
    openerPosition: openerPlayer?.position ?? null,
    openerSeat: openerPlayer?.seat ?? null,
    lastRaiserSeat: lastRaiserPlayer?.seat ?? null,
    involvement,
    limpers,
    facingAllIn,
    toCall,
    remaining,
    stackBB: (actor.stack) / state.bb,
    callPutsAllIn: toCall >= remaining,
  };
}

// Thresholds (share of all hands) for the actor's next preflop action in this situation.
// widthMult/aggression come from the actor's profile; openerWidth widens defense vs loose openers.
export function preflopThresholds({ position, tableSize, situation, params, openerWidth = 1 }) {
  const aggScale = clamp(params.pfrRatio / 0.55, 0.3, 1.8);
  const w = params.widthMult;
  const vsOpener = clamp(Math.sqrt(openerWidth), 0.7, 1.6);
  const role = position === 'BB' || position === 'SB' ? position : 'other';

  if (situation.raises <= 1) {
    // Nobody has raised: open (or limp, for passive players) / check in the big blind.
    const open = clamp(rfiShare(position, tableSize) * w, 0.02, 0.95);
    const raiseShare = clamp(0.3 + 1.4 * (params.pfrRatio - 0.2) / 0.7, 0.3, 1);
    const withLimpers = situation.limpers > 0 ? 0.85 : 1;
    return { kind: 'unopened', raise: open * raiseShare * withLimpers, play: open };
  }
  if (situation.raises === 2) {
    // Facing one raise: 3-bet / call / fold.
    const group = openerGroup(situation.openerPosition ?? 'CO');
    const defend = clamp(DEFEND[role][group] * w * vsOpener, 0.02, 0.9);
    const threeBet = clamp(THREE_BET[role][group] * w * aggScale * vsOpener, 0.01, defend);
    return { kind: 'vsOpen', raise: threeBet, play: defend };
  }
  if (situation.raises === 3) {
    // Facing a 3-bet without having opened: caught between the opener and the 3-bettor. A player who only
    // called the open continues with little; one putting money in for the first time (cold call or cold
    // 4-bet) only with the very top (about QQ+ and AK, most of it as a 4-bet).
    if (situation.involvement === 'cold' || situation.involvement === 'caller') {
      const cont = clamp((situation.involvement === 'cold' ? 0.035 : 0.06) * w * vsOpener, 0.02, 0.12);
      return { kind: 'vs3bet', raise: clamp(0.02 * aggScale, 0.01, cont), play: cont };
    }
    // The opener facing a 3-bet: 4-bet / call / fold, relative to how wide they opened.
    const opened = clamp(rfiShare(position, tableSize) * w, 0.05, 0.6);
    const cont = clamp(opened * 0.45 * vsOpener, 0.04, 0.3);
    const fourBet = clamp((0.025 + opened * 0.06) * aggScale, 0.015, cont);
    return { kind: 'vs3bet', raise: fourBet, play: cont };
  }
  // Facing a 4-bet or more: only the top of the top continues.
  const fiveBet = clamp(0.02 * w * aggScale, 0.01, 0.05);
  return { kind: 'vs4bet', raise: fiveBet, play: clamp(0.035 * w * vsOpener, fiveBet, 0.08) };
}

// Likelihood of the observed preflop action for every class (Float64Array(169)); used to narrow a villain's range.
// action: engine type (fold | check | call | bet | raise | allin).
// asPlayer: the sharper rules a practice bot plays by (see the header); the coach reads ranges without it.
export function preflopActionLikelihood({ action, position, tableSize, situation, params, openerWidth, asPlayer = false }) {
  const t = preflopThresholds({ position, tableSize, situation, params, openerWidth });
  const softness = 0.15 + params.noise * 2.2;
  const bluffShare = clamp(0.18 * params.bluffMult, 0.03, 0.6);
  const likelihood = new Float64Array(169);

  for (let cls = 0; cls < 169; cls++) {
    const entry = PREFLOP_BY_CLASS[cls];
    let inRaise = softTop(cls, t.raise, softness, asPlayer);
    let inPlay = softTop(cls, t.play, softness, asPlayer);
    // As a player, QQ+ and AK are never folded to one raise or a 3-bet, and are raised first in or re-raised
    // against one raise. Ranges near AK's edge (tight early-position spots) would otherwise blur them.
    if (asPlayer && PREMIUMS.has(entry.name) && t.kind !== 'vs4bet') {
      inPlay = 1;
      if (t.kind === 'unopened' || t.kind === 'vsOpen') inRaise = 1;
    }
    // Light raises: suited hands just outside the playing range get some bluff raises.
    const bluffZone = entry.start > t.raise && entry.start < t.play + 0.15 ? 1 : 0;
    const bluff = t.kind === 'unopened' ? 0 : bluffZone * bluffShare * (isSuitedClass(cls) ? 0.35 : 0.06);

    let value;
    if (action === 'raise' || action === 'bet' || action === 'allin') {
      value = Math.min(1, inRaise + bluff);
    } else if (action === 'call') {
      if (t.kind === 'unopened') {
        if (asPlayer) {
          // A limp: hands good enough to play but not raised. Only passive players have those (they raise less
          // than they play), and they also limp some strong hands to trap. A player who raises everything they
          // play almost never limps.
          const passive = clamp(1 - t.raise / Math.max(t.play, 1e-9), 0, 1);
          value = Math.max(0.003, inPlay - inRaise + 0.3 * passive * inRaise);
        } else {
          // A limp: hands good enough to play but not raised (passive players limp a lot).
          value = Math.max(0.02, inPlay - 0.9 * inRaise);
        }
      } else if (situation.facingAllIn || situation.callPutsAllIn) {
        // Calling off: roughly the strong part of the continuing range.
        value = softTop(cls, Math.min(t.play, t.raise * 1.6 + 0.01), softness, asPlayer);
      } else {
        // Flat call: the playing range minus most of the raising range (passive players trap more). As a
        // player, slow-playing is a passive habit: regulars, TAGs, LAGs and maniacs re-raise their strong hands
        // every time, while a nit flats them about 5% of the time, a loose-passive recreational player about 7%
        // and a calling station about 14%. (Hands at the edge of the re-raise range, like AKo against an early
        // open, still mix calls and re-raises, as solvers do.)
        // The floor (any hand might call) is a safety net when reading a range; a bot playing from it would
        // call raises with junk, so it's much lower for players.
        const trap = asPlayer ? clamp(0.6 * (1 - params.pfrRatio) - 0.28, 0, 0.2) : clamp(1 - params.pfrRatio, 0.1, 0.6);
        value = Math.max(asPlayer ? 0.002 : 0.01, inPlay - (1 - trap) * inRaise);
      }
    } else if (action === 'check') {
      // Big blind checking its option: everything except most of the raising range.
      value = 1 - 0.85 * softTop(cls, t.raise * 0.5, softness, asPlayer);
    } else {
      value = 1 - inPlay; // fold (not used for narrowing: the player is out)
    }
    likelihood[cls] = clamp(value, 0.0005, 1);
  }
  return { likelihood, thresholds: t };
}

// Multiply a combo-weight range (Float64Array(1326)) by per-class likelihoods.
export function applyClassLikelihood(weights, likelihood) {
  for (let i = 0; i < COMBO_COUNT; i++) weights[i] *= likelihood[COMBOS[i].cls];
}

// Recommended hero action preflop, from the same thresholds a solid regular (neutral profile) would use,
// adjusted for how wide the opener plays. Returns the thresholds and the hero hand's position in them.
export function preflopAdvice({ position, tableSize, situation, heroClass, openerWidth }) {
  const neutral = { widthMult: 1, pfrRatio: 0.55, noise: 0.08, bluffMult: 1 };
  const t = preflopThresholds({ position, tableSize, situation, params: neutral, openerWidth });
  const entry = PREFLOP_BY_CLASS[heroClass];
  const mid = (entry.start + entry.end) / 2;
  let best = 'fold';
  if (mid <= t.raise) best = 'raise';
  else if (mid <= t.play) best = t.kind === 'unopened' ? (position === 'BB' ? 'check' : 'raise') : 'call';
  if (t.kind === 'unopened' && position === 'BB' && best === 'fold') best = 'check';
  return { best, thresholds: t, handTop: mid };
}
