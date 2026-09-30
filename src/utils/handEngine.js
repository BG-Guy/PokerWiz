// Betting engine for the Add Hand flow (No-Limit Hold'em). Pure functions: each takes a hand state
// and returns a new one, so the page can keep a history for Undo.
//
// A hand state looks like:
//   players:  [{ seat, position, role: 'hero'|'villain', name, stack, invested, streetBet, folded, allIn, lastAction }]
//   street:   'Preflop' | 'Flop' | 'Turn' | 'River'
//   pot, currentBet (amount to match this street), minRaise, raises (bets/raises this street)
//   queue:    seats still to act this street, in order (queue[0] is on the clock)
//   streets:  [{ name, pot, actions: [{ actor, type, verb, amount, allIn? }] }]  (same shape Hand Review replays)
//   phase:    'action' | 'board' (deal next street) | 'result' (hand over)
//
// Stacks: a player can never put in more than their stack. Once everything is in they are all-in,
// skip the rest of the betting, and side pots are worked out at the end (see potLayers).
import { evaluateCodes } from './handEvaluator.js';

const NEXT_STREET = { Preflop: 'Flop', Flop: 'Turn', Turn: 'River' };
export const BOARD_CARDS = { Flop: 3, Turn: 1, River: 1 };

const round2 = (n) => Math.round(n * 100) / 100;

// Name written in the action log: "Hero" for you, otherwise the seat's position.
export const actorLabel = (player) => (player.role === 'hero' ? 'Hero' : player.position);

// Chips a player still has behind.
const remainingOf = (player) => round2(player.stack - player.invested);

// Seats that still have to act, in the given position order. With afterSeat, the order starts with the
// player after that seat and leaves that seat out (used after a bet or raise). Folded and all-in players are skipped.
function actingOrder(state, positionOrder, afterSeat = null) {
  let live = positionOrder
    .map((position) => state.players.find((p) => p.position === position && !p.folded))
    .filter(Boolean);
  if (afterSeat !== null) {
    const index = live.findIndex((p) => p.seat === afterSeat);
    live = [...live.slice(index + 1), ...live.slice(0, index)];
  }
  return live.filter((p) => !p.allIn).map((p) => p.seat);
}

// Start a hand: post blinds (capped by stack) and put the first preflop player on the clock.
// positions: table positions in seat order, clockwise from the button (see TABLE_POSITIONS).
// ante: a tournament big-blind ante, posted by the big blind on top of the blind. It goes in the pot
// but doesn't count toward the bet to call.
export function createHand({ players, positions, sb, bb, ante = 0 }) {
  const preflopOrder = [...positions.slice(3), ...positions.slice(0, 3)]; // UTG ... BTN, SB, BB
  const postflopOrder = [...positions.slice(1), positions[0]]; // SB, BB, ... BTN

  const list = players.map((p) => ({ ...p, invested: 0, streetBet: 0, folded: false, allIn: false, lastAction: null }));
  for (const p of list) {
    const anted = p.position === 'BB' ? Math.min(ante, p.stack) : 0;
    const blind = p.position === 'SB' ? sb : p.position === 'BB' ? bb : 0;
    const posted = Math.min(blind, p.stack - anted);
    p.invested = anted + posted;
    p.streetBet = posted;
    p.allIn = p.invested > 0 && p.invested >= p.stack;
  }

  // Blinds (and the ante) from seats that folded before the action reached them are dead money in the pot.
  const inHand = new Set(list.map((p) => p.position));
  const dead = (inHand.has('SB') ? 0 : sb) + (inHand.has('BB') ? 0 : bb + ante);
  const pot = round2(dead + list.reduce((sum, p) => sum + p.invested, 0));

  const state = {
    players: list,
    sb,
    bb,
    ante,
    pot,
    currentBet: bb,
    minRaise: bb,
    raises: 1, // the big blind counts as the first bet
    street: 'Preflop',
    board: [],
    streets: [{ name: 'Preflop', pot, actions: [] }],
    preflopOrder,
    postflopOrder,
    queue: [],
    phase: 'action',
  };
  state.queue = actingOrder(state, preflopOrder);
  return state;
}

export function currentPlayer(state) {
  return state.players.find((p) => p.seat === state.queue[0]);
}

// What the player on the clock can do.
export function getOptions(state) {
  const player = currentPlayer(state);
  const remaining = remainingOf(player);
  const facing = round2(state.currentBet - player.streetBet);
  const maxTo = round2(player.streetBet + remaining); // "all in" as a street total
  const othersCanAct = state.players.some((p) => p.seat !== player.seat && !p.folded && !p.allIn);
  const callIsAllIn = facing > 0 && facing >= remaining;
  const minRaiseTo = state.currentBet === 0 ? state.bb : round2(state.currentBet + state.minRaise);

  return {
    player,
    remaining,
    maxTo,
    toCall: round2(Math.min(facing, remaining)),
    canCheck: facing <= 0,
    callIsAllIn,
    // Raising only makes sense if you have chips beyond the call and someone can still respond.
    canRaise: !callIsAllIn && maxTo > state.currentBet && othersCanAct,
    isOpening: state.currentBet === 0,
    minTo: Math.min(minRaiseTo, maxTo),
  };
}

// Quick bet/raise sizes for the sizing chips, snapped to the small blind, between the minimum and all-in.
export function sizeSuggestions(state) {
  const { toCall, isOpening, minTo, maxTo } = getOptions(state);
  const snap = (x) => round2(Math.min(maxTo, Math.max(minTo, Math.round(x / state.sb) * state.sb)));
  let sizes;
  if (isOpening) {
    sizes = [['33%', state.pot * 0.33], ['50%', state.pot * 0.5], ['75%', state.pot * 0.75], ['Pot', state.pot]];
  } else if (state.street === 'Preflop' && state.raises === 1) {
    sizes = [['2.5 bb', state.bb * 2.5], ['3 bb', state.bb * 3], ['4 bb', state.bb * 4]];
  } else {
    sizes = [['2.5x', state.currentBet * 2.5], ['3x', state.currentBet * 3], ['4x', state.currentBet * 4]];
  }
  // Pot-sized raise: call first, then raise by the size of the pot after the call.
  if (!isOpening) sizes.push(['Pot', state.currentBet + state.pot + toCall]);

  // All-in has its own button, so leave out sizes that would put the player all in.
  const seen = new Set();
  return sizes
    .map(([label, amount]) => ({ label, amount: snap(amount) }))
    .filter(({ amount }) => amount < maxTo && !seen.has(amount) && seen.add(amount))
    .sort((a, b) => a.amount - b.amount);
}

// Log wording for a bet or raise, based on how many bets came before it this street.
function aggressionVerb(state) {
  if (state.currentBet === 0) return 'bets';
  if (state.street === 'Preflop') return state.raises === 1 ? 'raises to' : `${state.raises + 1}-bets to`;
  return state.raises === 1 ? 'raises to' : 're-raises to';
}

// Street is over: deal the next one, or go to showdown after the river.
function closeStreet(s) {
  s.queue = [];
  s.phase = s.street === 'River' ? 'result' : 'board';
}

// Apply one action by the player on the clock.
// action: { type: fold | check | call | bet | raise | allin, amount? }
// For bet/raise, amount is the total this player puts in on this street ("raise to"), capped at their stack.
export function applyAction(state, { type, amount }) {
  const s = structuredClone(state);
  const player = currentPlayer(s);
  const remaining = remainingOf(player);
  // type = the engine action, stored so hands can be replayed exactly (coach, future tools).
  const entry = { actor: actorLabel(player), type };

  const pay = (chips) => {
    player.streetBet = round2(player.streetBet + chips);
    player.invested = round2(player.invested + chips);
    s.pot = round2(s.pot + chips);
  };

  if (type === 'fold') {
    player.folded = true;
    entry.verb = 'folds';
    s.queue.shift();
  } else if (type === 'check') {
    entry.verb = 'checks';
    s.queue.shift();
  } else if (type === 'call') {
    const chips = round2(Math.min(s.currentBet - player.streetBet, remaining));
    pay(chips);
    entry.verb = 'calls';
    entry.amount = chips;
    s.queue.shift();
  } else {
    // Bet, raise or all-in. "to" is the street total, never more than the stack allows.
    const maxTo = round2(player.streetBet + remaining);
    const to = type === 'allin' ? maxTo : Math.min(round2(amount), maxTo);

    if (to <= s.currentBet) {
      // All-in for no more than the current bet: it's a call.
      const chips = round2(to - player.streetBet);
      pay(chips);
      entry.verb = 'calls';
      entry.amount = chips;
      s.queue.shift();
    } else {
      // A real bet/raise: everyone else still able to act must act again.
      entry.verb = aggressionVerb(s);
      entry.amount = to;
      s.minRaise = Math.max(s.minRaise, round2(to - s.currentBet));
      pay(round2(to - player.streetBet));
      s.currentBet = to;
      s.raises += 1;
      s.queue = actingOrder(s, s.street === 'Preflop' ? s.preflopOrder : s.postflopOrder, player.seat);
    }
  }

  // Anyone who just put their last chip in is all-in.
  if (!player.folded && remainingOf(player) <= 0) {
    player.allIn = true;
    entry.allIn = true;
    if (entry.verb !== 'calls') entry.verb = 'all in';
  }

  player.lastAction = { verb: entry.verb, amount: entry.amount, allIn: entry.allIn };
  s.streets[s.streets.length - 1].actions.push(entry);

  const live = s.players.filter((p) => !p.folded);
  const next = currentPlayer(s);
  if (live.length === 1) {
    // Everyone else folded.
    s.phase = 'result';
    s.queue = [];
    s.uncontestedWinner = live[0].seat;
  } else if (s.queue.length === 0) {
    closeStreet(s);
  } else if (s.queue.length === 1 && next.streetBet >= s.currentBet && live.every((p) => p.allIn || p.seat === next.seat)) {
    // The only player left with chips has nothing to call and nobody to bet against.
    closeStreet(s);
  }
  return s;
}

// Deal the next street's cards and reset betting for it. If fewer than two players can still bet
// (the rest are all-in), there's no action this street and the board just runs out.
export function dealBoard(state, cards) {
  const s = structuredClone(state);
  s.street = NEXT_STREET[s.street];
  s.board = [...s.board, ...cards];
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.raises = 0;
  for (const p of s.players) {
    p.streetBet = 0;
    p.lastAction = null;
  }
  s.streets.push({ name: s.street, pot: s.pot, actions: [] });
  s.queue = actingOrder(s, s.postflopOrder);
  s.phase = 'action';
  if (s.queue.length < 2) closeStreet(s);
  return s;
}

export function nextStreet(state) {
  return NEXT_STREET[state.street];
}

// Best hand(s) at showdown when every remaining player's cards are known; otherwise null.
export function showdownWinners(state, cardsBySeat) {
  const live = state.players.filter((p) => !p.folded);
  if (state.board.length < 5 || live.some((p) => (cardsBySeat[p.seat] ?? []).length !== 2)) return null;
  const scores = live.map((p) => ({ seat: p.seat, score: evaluateCodes([...cardsBySeat[p.seat], ...state.board]) }));
  const best = Math.max(...scores.map((s) => s.score));
  return scores.filter((s) => s.score === best).map((s) => s.seat);
}

// Split the pot into a main pot and side pots. Each layer lists the players who can win it:
// a player all-in for $50 can only win the part of the pot everyone matched up to $50.
export function potLayers(state) {
  const live = state.players.filter((p) => !p.folded);
  const levels = [...new Set(live.map((p) => p.invested))].sort((a, b) => a - b);
  const layers = [];
  let previous = 0;
  for (const level of levels) {
    const amount = state.players.reduce((sum, p) => sum + Math.min(p.invested, level) - Math.min(p.invested, previous), 0);
    layers.push({ amount: round2(amount), eligible: live.filter((p) => p.invested >= level).map((p) => p.seat) });
    previous = level;
  }
  // Dead blinds, and anything folded players put in above the top level, go to the main/top pot.
  const counted = layers.reduce((sum, l) => sum + l.amount, 0);
  if (layers.length) {
    layers[0].amount = round2(layers[0].amount + (state.pot - counted));
  }
  return layers;
}

// Hero's net result: their share of each pot they could win, minus what they put in.
// In each pot the chosen winners who are eligible split it; if none of them are eligible
// (e.g. an uncalled bet, or a side pot between two others), it goes to whoever is.
export function heroResult(state, winnerSeats) {
  const hero = state.players.find((p) => p.role === 'hero');
  let won = 0;
  for (const layer of potLayers(state)) {
    let takers = layer.eligible.filter((seat) => winnerSeats.includes(seat));
    if (takers.length === 0) takers = layer.eligible;
    if (takers.includes(hero.seat)) won += layer.amount / takers.length;
  }
  return round2(won - hero.invested);
}

// Tags worth filtering by later: pot type, all-in, multiway, showdown.
export function autoTags(state) {
  const preflopRaises = state.streets[0].actions.filter((a) => a.verb.includes('raise') || a.verb.includes('-bets') || a.verb === 'all in').length;
  const tags = [];
  if (preflopRaises >= 2) tags.push(`${preflopRaises + 1}-bet pot`);
  else if (preflopRaises === 1) tags.push('Single-raised pot');
  if (state.streets.some((street) => street.actions.some((a) => a.allIn))) tags.push('All in');
  // Multiway: more than two players acted on the flop.
  if (state.streets[1] && new Set(state.streets[1].actions.map((a) => a.actor)).size > 2) tags.push('Multiway');
  if (state.phase === 'result' && state.uncontestedWinner === undefined) tags.push('Showdown');
  return tags;
}
