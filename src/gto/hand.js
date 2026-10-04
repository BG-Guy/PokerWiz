// The GTO engine for one real hand, from the deal to the river. It follows the action as the hand engine
// (utils/handEngine.js) plays it, keeps every player's range, and answers "what does GTO do here with these
// cards" for whoever is to act. Everyone is assumed to play GTO; only position and stack depth matter.
//
//   preflop   the solved 8-max charts (preflop/), at the stack depth closest to the hand's
//   postflop  a fresh solve of each street (postflop/) from the ranges the players brought to it
//
// Player reads (profiles) aren't used yet. When they are, they plug in here: a read would lock a player's
// strategy at the spots it describes (advise) and narrow their range by that strategy (apply), and the solver
// would answer everyone else against it.
import { loadChart } from './preflop/charts.js';
import { mapSeats, createPreflopWalker, matchAction } from './preflop/walker.js';
import { createStreet } from './postflop/street.js';
import { cardId, handIndex, classOfCards, expandClasses, collapseToClasses } from './cards.js';
import { currentPlayer, getOptions } from '../utils/handEngine.js';

// Postflop solves cover heads-up and 3-way pots (4-way solves don't converge in a phone's time budget).
export const MAX_POSTFLOP_PLAYERS = 3;
const STREET_INDEX = { Flop: 1, Turn: 2, River: 3 };

// The hand's action in solver terms: { type: fold|check|call|bet|raise|allin, to (big blinds, street total) }.
export function solverAction(state, action) {
  const opts = getOptions(state);
  const bb = state.bb;
  if (action.type === 'fold' || action.type === 'check') return { type: action.type };
  if (action.type === 'call') return { type: 'call', to: Math.min(state.currentBet, opts.maxTo) / bb };
  const to = action.type === 'allin' ? opts.maxTo : Math.min(action.amount, opts.maxTo);
  if (to <= state.currentBet) return { type: 'call', to: to / bb };
  if (to >= opts.maxTo - 1e-9) return { type: 'allin', to: to / bb };
  return { type: state.currentBet > 0 ? 'raise' : 'bet', to: to / bb };
}

// state: the hand as dealt (createHand). stackBB: the depth to play (the effective stack that matters).
// known: { seat: ['As', 'Kd'] } cards we'll ask about (the solve makes sure it can value them).
// folders: positions that fold first or aren't in the hand (lets a 9-handed hand fit the 8-handed charts).
export async function createGtoHand({ state, stackBB, known = {}, detail = 'full', seed = 1, folders = new Set() }) {
  const bb = state.bb;
  const chart = await loadChart(stackBB, (state.ante ?? 0) / bb);
  const seatOf = mapSeats(state.preflopOrder, folders);
  const walker = createPreflopWalker(chart, seatOf);
  const knownHand = {};
  for (const [seat, cards] of Object.entries(known)) {
    if (cards?.length === 2) knownHand[seat] = handIndex(cardId(cards[0]), cardId(cards[1]));
  }

  let street = null; // the current postflop street session
  let order = []; // seats in postflop order on the current street
  const rangesBySeat = new Map(); // 1326-weight ranges carried from street to street
  let unavailable = null; // why the postflop can't be solved (too many players...)

  // Postflop: set up a new street from the state right after its cards are dealt.
  function startStreet(s) {
    const alive = s.postflopOrder.map((position) => s.players.find((p) => p.position === position && !p.folded)).filter(Boolean);
    // Ranges: from the previous street, or from the preflop charts for the flop.
    if (street) {
      const previous = street.ranges();
      order.forEach((seat, k) => rangesBySeat.set(seat, previous[k]));
    } else {
      for (const p of alive) {
        const classes = walker.rangeOf(p.position);
        rangesBySeat.set(p.seat, classes ? expandClasses(classes) : new Float32Array(1326).fill(1));
      }
    }
    order = alive.map((p) => p.seat);
    if (alive.length > MAX_POSTFLOP_PLAYERS) {
      unavailable = `postflop GTO covers heads-up and 3-way pots; this one has ${alive.length} players.`;
      street = null;
      return;
    }
    street = createStreet({
      board: s.board.map(cardId),
      ranges: alive.map((p) => rangesBySeat.get(p.seat)),
      pot: s.pot / bb,
      stacks: alive.map((p) => (p.stack - p.invested) / bb),
      include: alive.map((p) => (knownHand[p.seat] !== undefined ? [knownHand[p.seat]] : [])),
      detail,
      seed: seed * 31 + STREET_INDEX[s.street],
    });
  }

  // Options in the app's terms: amounts in chips, value relative to folding (chips) when known.
  function optionsFrom(actions, strategy, values) {
    return actions.map((a, k) => ({
      type: a.type,
      to: a.to !== undefined ? Math.round(a.to * bb * 100) / 100 : undefined,
      frequency: strategy[k],
      ev: values ? values[k] * bb : null,
    }));
  }

  return {
    chart: chart.config,
    // Call after each new street is dealt (s = the hand right after dealBoard).
    startStreet,
    // Cards that became known later (e.g. dealt to a replayed villain): solves of later streets include them.
    know(seat, cards) {
      if (cards?.length === 2) knownHand[seat] = handIndex(cardId(cards[0]), cardId(cards[1]));
    },
    // GTO for the player to act holding `cards`: { source: 'chart' | 'solver', options: [{ type, to (chips),
    // frequency, ev (chips vs folding) }], lossBB (preflop: bb worse than the best option), exact } or
    // { unavailable: reason }.
    advise(s, cards) {
      const actor = currentPlayer(s);
      const [a, b] = cards.map(cardId);
      if (s.street === 'Preflop') {
        if (!walker.moveTo(actor.position)) return { unavailable: walker.lost ?? 'This seat is not part of the solved game.' };
        const advice = walker.advice(classOfCards(a, b));
        if (!advice) return { unavailable: 'No solution for this spot.' };
        const base = Math.max(0, advice.actions.findIndex((x) => x.type === 'fold' || x.type === 'check'));
        const values = advice.loss.map((loss) => advice.loss[base] - loss);
        return { source: 'chart', chart: chart.config, options: optionsFrom(advice.actions, advice.strategy, values), lossBB: advice.loss, exact: advice.exact };
      }
      if (!street) return { unavailable: unavailable ?? 'The street has not started.' };
      const advice = street.advice(order.indexOf(actor.seat), handIndex(a, b));
      return { source: 'solver', options: optionsFrom(advice.actions, advice.strategy, advice.values), exact: true, iterations: advice.iterations, elapsed: advice.elapsed };
    },
    // Which advised option a real action is (preflop sizes map to the nearest size the charts have).
    optionIndex(s, action, advice) {
      const real = solverAction(s, action);
      if (s.street === 'Preflop') return matchAction(walker.node, real, chart.config.stack).index;
      return advice.options.findIndex((o) => {
        if (real.type === 'allin') return o.type === 'allin';
        if (real.type === 'bet' || real.type === 'raise') return (o.type === 'bet' || o.type === 'raise') && Math.abs(o.to - real.to * bb) <= Math.max(0.05 * bb, 0.015 * s.pot);
        return o.type === real.type;
      });
    },
    // The whole street's real actions, when known up front (reviewing a finished hand), so one solve covers
    // them all: entries = [{ state (before the action), action }].
    planStreet(entries) {
      if (!street) return;
      street.setPlan(entries.map(({ state: s, action }) => ({ player: order.indexOf(currentPlayer(s).seat), ...solverAction(s, action) })));
    },
    // A real action by the player to act (call with the state before it's applied).
    apply(s, action) {
      const actor = currentPlayer(s);
      const real = solverAction(s, action);
      if (s.street === 'Preflop') walker.apply(actor.position, real);
      else if (street) street.apply({ player: order.indexOf(actor.seat), ...real });
    },
    // A seat's range right now as 169 class weights (largest = 1), or null.
    rangeOf(s, seat) {
      const player = s.players.find((p) => p.seat === seat);
      let classes = null;
      if (s.street === 'Preflop' || !street) classes = player ? walker.rangeOf(player.position) : null;
      else {
        const k = order.indexOf(seat);
        if (k >= 0) classes = collapseToClasses(street.ranges()[k]);
      }
      if (!classes) return null;
      const max = Math.max(...classes, 1e-12);
      return Array.from(classes, (w) => w / max);
    },
    // A seat's range right now as 1326 weights (to deal it cards that fit how it played), or null.
    handRangeOf(s, seat) {
      if (s.street !== 'Preflop' && street) {
        const k = order.indexOf(seat);
        if (k >= 0) return street.ranges()[k];
      }
      const player = s.players.find((p) => p.seat === seat);
      const classes = player ? walker.rangeOf(player.position) : null;
      return classes ? expandClasses(classes) : null;
    },
    // Why the preflop couldn't be followed exactly (null when it could).
    get lost() {
      return walker.lost;
    },
  };
}
