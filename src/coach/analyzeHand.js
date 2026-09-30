// The coach's entry point: replays a recorded hand, tracks every villain's range as they act, grades each
// hero decision, and summarizes the hand (accuracy %, grades, biggest leak).
//
// Range tracking is Bayesian: every villain starts with all hands (minus the hero's cards), and each action
// multiplies each combo's weight by how likely that player type is to take that action with that combo.
// Preflop uses position charts (preflopModel), postflop uses strength + price + traits (postflopModel).
import { COMBOS, COMBO_COUNT, CLASS_NAMES, classOf } from './combos.js';
import { codeToIndex } from '../utils/cards.js';
import { currentPlayer } from '../utils/handEngine.js';
import { evaluate, categoryOf, HAND_NAMES } from '../utils/handEvaluator.js';
import { modelParams, defaultProfile, describeProfile } from './profiles.js';
import { preflopSituation, preflopActionLikelihood, applyClassLikelihood } from './preflopModel.js';
import { PREFLOP_BY_CLASS } from './preflopTable.js';
import { computeStrengths, percentileOf, strengthWord } from './boardStrength.js';
import { postflopActionLikelihood } from './postflopModel.js';
import { gradePreflop, gradePostflop, villainReads } from './decisions.js';
import { equityVsHands } from './equity.js';
import { overallAccuracy, accuracyLabel, GRADES } from './grading.js';
import { explainPreflop, explainPostflop } from './explain.js';
import { replayHand } from './replay.js';
import { createRandom, seedFromString } from './random.js';

const round2 = (n) => Math.round(n * 100) / 100;

// How the hero's hand stands right now ("Top pair, strong: 82nd percentile").
function describeHeroHand(heroCards, board, strengths) {
  const cls = classOf(heroCards[0], heroCards[1]);
  if (board.length < 3) {
    const entry = PREFLOP_BY_CLASS[cls];
    return { name: CLASS_NAMES[cls], text: `Top ${Math.round(((entry.start + entry.end) / 2) * 100)}% starting hand` };
  }
  const score = evaluate([...heroCards, ...board]);
  const percentile = percentileOf(strengths, score);
  return {
    name: HAND_NAMES[categoryOf(score)],
    percentile,
    text: `${HAND_NAMES[categoryOf(score)]}, ${strengthWord(percentile)} (beats ${Math.round(percentile * 100)}% of possible hands)`,
  };
}

// Map a logged action to what the likelihood models understand.
function modelAction(type, actor, state) {
  const facing = state.currentBet - actor.streetBet > 0;
  if (type === 'allin') {
    const allInTo = actor.streetBet + (actor.stack - actor.invested);
    if (allInTo <= state.currentBet) return { facing, action: 'call' };
    return { facing, action: facing ? 'raise' : 'bet' };
  }
  if (type === 'bet' || type === 'raise') return { facing, action: facing ? 'raise' : 'bet' };
  return { facing, action: type };
}

// record: see HandRecorder.buildRecord(). Returns the full report (plain data, safe to post from a worker).
export function analyzeHand(record, { iterations = 2500 } = {}) {
  const random = createRandom(seedFromString(JSON.stringify([record.players.map((p) => [p.position, p.cards, p.stack]), record.streets, record.board])));
  const heroRecord = record.players.find((p) => p.role === 'hero');
  if (!heroRecord || heroRecord.cards?.length !== 2) throw new Error('The coach needs your two hole cards.');
  const heroCards = heroRecord.cards.map(codeToIndex);
  const heroProfile = heroRecord.profile ?? defaultProfile();
  const heroSkill = heroProfile.skill / 100;
  const heroImage = modelParams(heroProfile);
  const tableSize = record.tableSize ?? record.positions.length;
  const bb = record.stakes.bb;

  // Every villain starts with every hand the hero isn't holding.
  const villains = record.players
    .filter((p) => p.role === 'villain')
    .map((p) => {
      const profile = p.profile ?? defaultProfile();
      const weights = new Float64Array(COMBO_COUNT);
      for (let i = 0; i < COMBO_COUNT; i++) {
        const [a, b] = COMBOS[i].cards;
        weights[i] = heroCards.includes(a) || heroCards.includes(b) ? 0 : 1;
      }
      return {
        seat: p.seat,
        position: p.position,
        name: p.name ?? p.position,
        profile,
        label: describeProfile(profile).label,
        params: modelParams(profile, heroProfile),
        weights,
        cards: (p.cards ?? []).map(codeToIndex),
        startWidth: 1,
      };
    });
  const villainsBySeat = new Map(villains.map((v) => [v.seat, v]));
  const ctx = { heroPosition: heroRecord.position, heroProfile, villainsBySeat, bb };

  let boardKey = null;
  let strengths = null;
  const decisions = [];
  // Who made the last bet/raise, this street and the one before (to spot "donk" leads).
  let currentStreet = 'Preflop';
  let streetAggressor = null;
  let previousAggressor = null;
  // Size of the latest bet/raise on this street relative to the pot it went into (what it represents).
  let lastBetRatio = null;

  replayHand(record, ({ state, action, type, street, actionsSoFar }) => {
    const board = state.board.map(codeToIndex);
    const key = board.join(',');
    if (key !== boardKey) {
      boardKey = key;
      strengths = board.length >= 3 ? computeStrengths(board, heroCards) : null;
    }
    const actor = currentPlayer(state);
    if (street !== currentStreet) {
      previousAggressor = streetAggressor ?? previousAggressor;
      streetAggressor = null;
      lastBetRatio = null;
      currentStreet = street;
    }
    const facedBetRatio = lastBetRatio;
    const isAggressive = type === 'bet' || type === 'raise' || (type === 'allin' && actor.streetBet + (actor.stack - actor.invested) > state.currentBet);
    // The actor is "donking" if they lead into the previous street's aggressor, who acts after them.
    const aggressorStillIn = previousAggressor !== null && previousAggressor !== actor.seat && !state.players.find((p) => p.seat === previousAggressor)?.folded;
    const donk = street !== 'Preflop' && streetAggressor === null && aggressorStillIn && state.queue.includes(previousAggressor);
    if (isAggressive) {
      streetAggressor = actor.seat;
      const to = type === 'allin' ? actor.streetBet + (actor.stack - actor.invested) : action.amount;
      lastBetRatio = Math.max(0, to - Math.max(state.currentBet, actor.streetBet)) / Math.max(state.pot + Math.max(0, state.currentBet - actor.streetBet), 1e-9);
    }

    // ----- Hero decision: grade it -----
    if (actor.role === 'hero') {
      // Leading into the previous street's aggressor: they hold the stronger range and defend more.
      const leadsIntoAggressor = street !== 'Preflop' && donk;
      const common = { state, type, amount: action.amount, heroCards, board, villains, heroSkill, iterations, random, leadsIntoAggressor };
      const graded =
        street === 'Preflop'
          ? gradePreflop({ ...common, actionsSoFar, tableSize })
          : gradePostflop({ ...common, street, strengths });

      const active = villains.filter((v) => !state.players.find((p) => p.seat === v.seat).folded);
      const known = active.length > 0 && active.every((v) => v.cards.length === 2);
      const equityVsActual = known ? equityVsHands({ hero: heroCards, board, hands: active.map((v) => v.cards), iterations: 1500, random }).equity : null;

      const decision = {
        index: decisions.length,
        street,
        pot: state.pot,
        board: state.board,
        heroHand: describeHeroHand(heroCards, board, strengths),
        equityVsActual,
        reads: villainReads(villains, state),
        aggressorSeat: streetAggressor,
        facedBetRatio,
        ...graded,
      };
      decision.notes = graded.kind === 'chart' ? explainPreflop(decision, ctx) : explainPostflop(decision, ctx);
      decisions.push(decision);
      return;
    }

    // ----- Villain action: narrow their range -----
    const villain = villainsBySeat.get(actor.seat);
    if (!villain || type === 'fold') return;
    const { facing, action: modeled } = modelAction(type, actor, state);

    if (street === 'Preflop') {
      const situation = preflopSituation(state, actionsSoFar, actor.seat);
      const opener = situation.openerSeat === record.heroSeat ? { params: heroImage } : villainsBySeat.get(situation.openerSeat);
      const { likelihood } = preflopActionLikelihood({
        action: modeled === 'bet' ? 'raise' : modeled,
        position: actor.position,
        tableSize,
        situation,
        params: villain.params,
        openerWidth: opener?.params.widthMult ?? 1,
      });
      applyClassLikelihood(villain.weights, likelihood);
    } else {
      const toCall = Math.max(0, state.currentBet - actor.streetBet);
      const defenders = state.players.filter((p) => !p.folded && p.seat !== actor.seat).length;
      // Size of a bet/raise relative to the pot: bigger means a stronger (more polarized) range.
      const to = type === 'allin' ? actor.streetBet + (actor.stack - actor.invested) : action.amount ?? 0;
      const sizeRatio = facing
        ? Math.max(0, to - state.currentBet) / Math.max(state.pot + toCall, 1e-9)
        : Math.max(0, to - actor.streetBet) / Math.max(state.pot, 1e-9);
      const likelihood = postflopActionLikelihood({
        action: modeled,
        strengths,
        context: {
          facingBet: facing,
          facingRaise: facing && state.raises >= 2,
          betRatio: facing ? facedBetRatio ?? undefined : undefined,
          pot: state.pot,
          toCall,
          defenders,
          donk,
          sizeRatio: modeled === 'bet' || modeled === 'raise' ? sizeRatio : undefined,
        },
        params: villain.params,
        weights: villain.weights,
      });
      for (let i = 0; i < COMBO_COUNT; i++) villain.weights[i] *= likelihood[i];
    }
  });

  // ----- Summary -----
  const accuracy = overallAccuracy(decisions, bb);
  const counts = Object.fromEntries(GRADES.map((g) => [g.id, decisions.filter((d) => d.grade.id === g.id).length]));
  const evLost = round2(decisions.reduce((sum, d) => sum + (d.evLoss ?? 0), 0));
  const worst = decisions.reduce((a, d) => (!a || d.score < a.score ? d : a), null);
  const keyLesson =
    worst && worst.score < 80
      ? {
          street: worst.street,
          text:
            worst.kind === 'chart'
              ? `${worst.street}: ${worst.advice.best === 'raise' ? 'raising' : worst.advice.best === 'call' ? 'calling' : worst.advice.best === 'check' ? 'checking' : 'folding'} was the standard play with ${worst.heroClass}.`
              : `${worst.street}: ${worst.best.label} was better than ${worst.actual.label}.`,
        }
      : null;

  return {
    accuracy,
    label: accuracyLabel(accuracy),
    counts,
    evLost,
    evLostBB: round2(evLost / bb),
    keyLesson,
    heroSkill,
    hero: {
      position: heroRecord.position,
      cards: heroRecord.cards,
      label: describeProfile(heroProfile).label,
      tilt: heroProfile.tilt ?? 0,
    },
    villains: villains.map((v) => ({
      seat: v.seat,
      name: v.name,
      position: v.position,
      label: v.label,
      cards: record.players.find((p) => p.seat === v.seat)?.cards ?? [],
      finalWidth: round2(v.weights.reduce((s, w) => s + w, 0) / Math.max(...v.weights, 1e-300) / COMBO_COUNT),
    })),
    decisions,
    result: record.result,
    pot: record.pot,
    stakes: record.stakes,
  };
}
