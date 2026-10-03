// Practice spots: deals a random hand and plays every villain from their read (tendency, skill level, stack)
// until it's your turn, using the same models the coach uses to read ranges. Villains act on their real
// cards, so a recreational player's big bet really is a strong hand, and a drunk really does call with anything.
//
// Formats:
//   preflop  a full 9-handed table; everyone before you acts, you make the next decision
//   hu       a heads-up pot: one player opens, the other calls, then a decision on the flop, turn or river
//   3way     the same with three players
// Streets before the spot are played for you by a solid regular; spots where that player would have folded
// are redealt. From the spot on, the hand plays to the end: you make every decision, villains answer, and the
// next cards are dealt at random or picked by you (see dealStreet).
import { createHand, applyAction, dealBoard, currentPlayer, getOptions, showdownWinners, heroResult } from '../utils/handEngine.js';
import { TABLE_POSITIONS } from '../constants/poker.js';
import { FULL_DECK, codeToIndex } from '../utils/cards.js';
import { classOf, comboIndex } from '../coach/combos.js';
import { PREFLOP_BY_CLASS } from '../coach/preflopTable.js';
import { modelParams, defaultProfile } from '../coach/profiles.js';
import { preflopSituation, preflopActionLikelihood } from '../coach/preflopModel.js';
import { computeStrengths } from '../coach/boardStrength.js';
import { comboActionProbabilities } from '../coach/postflopModel.js';

// Blinds are $1/$2 in both games; tournaments add a big-blind ante and play shallower, with smaller opens.
export const GAMES = [
  { id: 'cash', label: 'Cash game', tableSize: 9, sb: 1, bb: 2, ante: 0, openBB: 2.5, defaultStackBB: 100, stakesLabel: '$1/$2' },
  { id: 'mtt', label: 'Tournament', tableSize: 9, sb: 1, bb: 2, ante: 2, openBB: 2.2, defaultStackBB: 30, stakesLabel: '1/2 + ante' },
];

export const FORMATS = [
  { id: 'preflop', label: 'Preflop', description: 'A full table acts before you. Open, call, 3-bet or fold, then play the hand out.', villains: 1 },
  { id: 'hu', label: 'Heads-up', description: 'Two players see a flop. You take over on the flop, turn or river and play to the end.', villains: 1 },
  { id: '3way', label: '3-way', description: 'Three players see a flop. You take over on the flop, turn or river and play to the end.', villains: 2 },
];

const TARGET_STREETS = [['Flop', 0.45], ['Turn', 0.3], ['River', 0.25]];
const BOARD_CARDS = { Flop: 3, Turn: 1, River: 1 };
const round2 = (n) => Math.round(n * 100) / 100;

// The player who plays your earlier streets, and whose ranges your hands are drawn from: a solid regular.
export const HERO_AUTOPILOT = modelParams(defaultProfile());

function pickWeighted(items, random) {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}

// A deck that deals by rejection: accept(codes) gives each candidate hand a chance (0..1) of being kept,
// so a player's cards fit the action they're about to take. cards = what's left (starts as a full deck).
export function createDeck(random, remaining = FULL_DECK) {
  const cards = [...remaining];
  const take = (code) => {
    const at = cards.indexOf(code);
    if (at !== -1) cards.splice(at, 1);
  };
  return {
    cards,
    take,
    dealHand(accept = () => 1) {
      let pick = null;
      for (let tries = 0; tries < 600; tries++) {
        const a = cards[Math.floor(random() * cards.length)];
        let b = a;
        while (b === a) b = cards[Math.floor(random() * cards.length)];
        pick = [a, b];
        if (random() < accept(pick)) break;
      }
      pick.forEach(take);
      return pick;
    },
    deal(count) {
      const out = [];
      for (let i = 0; i < count; i++) {
        const code = cards[Math.floor(random() * cards.length)];
        take(code);
        out.push(code);
      }
      return out;
    },
  };
}

const classOfCodes = (codes) => classOf(codeToIndex(codes[0]), codeToIndex(codes[1]));

// ----- Preflop -----

// Likelihood of each preflop action for one hand class (not normalized).
function preflopWeights({ state, actions, seat, cls, params, tableSize, openerWidth }) {
  const actor = state.players.find((p) => p.seat === seat);
  const situation = preflopSituation(state, actions, seat);
  const opts = getOptions(state);
  const choices = opts.canCheck ? ['check'] : ['fold', 'call'];
  if (opts.canRaise) choices.push('raise');
  return choices.map((action) => {
    const { likelihood } = preflopActionLikelihood({ action, position: actor.position, tableSize, situation, params, openerWidth, asPlayer: true });
    return [action, likelihood[cls]];
  });
}

// Raise size: opens are 2.2-2.5 bb (+1 bb per limper), re-raises 3x. Short stacks just shove.
function preflopRaiseTo(state, game, limpers) {
  const opts = getOptions(state);
  const actor = currentPlayer(state);
  const to = state.raises <= 1 ? game.openBB * state.bb + limpers * state.bb : state.currentBet * 3;
  const stackBB = actor.stack / state.bb;
  if (stackBB <= 12 || to >= 0.4 * opts.maxTo) return { type: 'allin' };
  return { type: 'raise', amount: round2(Math.max(opts.minTo, Math.round(to / state.sb) * state.sb)) };
}

function openerWidthFor(state, actions, seat, paramsBySeat) {
  const situation = preflopSituation(state, actions, seat);
  return paramsBySeat.get(situation.openerSeat)?.widthMult ?? 1;
}

function limpersIn(actions) {
  return actions.filter((a) => a.verb === 'calls').length;
}

// ----- Postflop -----

const BET_SIZES = [0.33, 0.5, 0.75, 1];

// A villain's (or your autopilot's) postflop action with their real cards.
function postflopAction({ state, seat, cards, params, strengths, tracker, random }) {
  const opts = getOptions(state);
  const index = comboIndex(codeToIndex(cards[0]), codeToIndex(cards[1]));
  const defenders = state.players.filter((p) => !p.folded && p.seat !== seat).length;

  if (opts.toCall <= 0) {
    // Sizes: everyone uses the standard ones; wild players also overbet.
    const sizes = params.aggression > 3.5 || params.noise > 0.2 ? [...BET_SIZES, 1.5] : BET_SIZES;
    const size = sizes[Math.floor(random() * sizes.length)];
    const aggressorIn = tracker.previous !== null && tracker.previous !== seat && !state.players.find((p) => p.seat === tracker.previous)?.folded;
    const donk = tracker.current === null && aggressorIn && state.queue.includes(tracker.previous);
    const p = comboActionProbabilities({ index, strengths, context: { facingBet: false, donk, sizeRatio: size }, params });
    if (!opts.canRaise || random() >= p.bet) return { type: 'check' };
    const to = round2(Math.max(opts.minTo, Math.round((state.pot * size) / state.sb) * state.sb));
    return to >= opts.maxTo * 0.85 ? { type: 'allin' } : { type: 'bet', amount: to };
  }

  const context = {
    facingBet: true,
    facingRaise: state.raises >= 2,
    betRatio: tracker.betRatio ?? undefined,
    pot: state.pot,
    toCall: opts.toCall,
    defenders,
    donk: false,
  };
  const p = comboActionProbabilities({ index, strengths, context, params });
  const choices = [['fold', p.fold], ['call', p.call]];
  if (opts.canRaise) choices.push(['raise', p.raise]);
  else choices[1][1] += p.raise;
  const action = pickWeighted(choices, random);
  if (action !== 'raise') return { type: action };
  const to = round2(Math.max(opts.minTo, Math.round((state.currentBet * 3) / state.sb) * state.sb));
  return to >= opts.maxTo * 0.8 ? { type: 'allin' } : { type: 'raise', amount: to };
}

// Keeps who bet last this street and the street before (to spot donk leads), and the size of the last bet.
export function applyTracked(state, action, tracker) {
  const actor = currentPlayer(state);
  const before = state.currentBet;
  const toCall = Math.max(0, before - actor.streetBet);
  const next = applyAction(state, action);
  if (next.currentBet > before) {
    tracker.current = actor.seat;
    tracker.betRatio = (next.currentBet - Math.max(before, actor.streetBet)) / Math.max(state.pot + toCall, 1e-9);
  }
  return next;
}

// ----- Spot builder -----

// setup: { game, format, villains: [{ profile, stackBB }], hero: { profile, stackBB } }
// Returns a spot with you on the clock, or null if none came up (very rare; call again). A spot holds
// everything needed to keep playing: { state, cards: { seat: [codes] }, deck (cards left), heroSeat,
// villainSeats, players, paramsBySeat, tracker, game, positions, setup, firstDecision, status }.
// firstDecision = how many of your decisions came before the spot (played for you), so grading can skip them.
// Heads-up and 3-way hands are redealt until those players really reach the flop together. That can take a few
// hundred deals for a 3-way pot, but a deal is cheap: it stops at the first fold.
const ATTEMPTS = { preflop: 60, hu: 8000, '3way': 20000 };

export function generateSpot(setup, random = Math.random) {
  const attempts = ATTEMPTS[setup.format] ?? 60;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const spot = setup.format === 'preflop' ? tryPreflopSpot(setup, random) : tryPostflopSpot(setup, random);
    if (spot) return spot;
  }
  return null;
}

function tableFor(setup) {
  const game = GAMES.find((g) => g.id === setup.game) ?? GAMES[0];
  return { game, positions: TABLE_POSITIONS[game.tableSize] };
}

export const heroDecisions = (state) => state.streets.reduce((n, street) => n + street.actions.filter((a) => a.actor === 'Hero').length, 0);

function makeSpot(fields) {
  return { ...fields, firstDecision: heroDecisions(fields.state), status: 'hero' };
}

// Preflop: every seat is filled; everyone except you plays the "table" read.
function tryPreflopSpot(setup, random) {
  const { game, positions } = tableFor(setup);
  const heroSeat = Math.floor(random() * positions.length);
  const table = setup.villains[0] ?? { profile: defaultProfile(), stackBB: game.defaultStackBB };
  const params = modelParams(table.profile, setup.hero.profile);
  const players = positions.map((position, seat) => {
    const isHero = seat === heroSeat;
    const stackBB = isHero ? setup.hero.stackBB : table.stackBB;
    return {
      seat,
      position,
      role: isHero ? 'hero' : 'villain',
      name: isHero ? 'You' : position,
      stack: stackBB * game.bb,
      profile: isHero ? setup.hero.profile : table.profile,
    };
  });
  const paramsBySeat = new Map(players.map((p) => [p.seat, p.role === 'hero' ? HERO_AUTOPILOT : params]));
  const deck = createDeck(random);
  const cards = {};
  // Your hand: half the time any two cards, otherwise the bottom 40% of hands is redealt (fewer auto-folds).
  cards[heroSeat] = deck.dealHand((codes) => (random() < 0.5 || PREFLOP_BY_CLASS[classOfCodes(codes)].start < 0.6 ? 1 : 0));
  for (const p of players) if (p.seat !== heroSeat) cards[p.seat] = deck.dealHand();

  const tracker = { current: null, previous: null, betRatio: null };
  let state = createHand({ players, positions, sb: game.sb, bb: game.bb, ante: game.ante });
  while (state.phase === 'action') {
    const actor = currentPlayer(state);
    if (actor.seat === heroSeat) {
      const villainSeats = players.filter((p) => p.role === 'villain').map((p) => p.seat);
      return makeSpot({ state, cards, deck: deck.cards, heroSeat, villainSeats, players, paramsBySeat, tracker, game, positions, setup });
    }
    state = applyTracked(state, preflopMove(state, actor, cards, paramsBySeat, game, random), tracker);
  }
  return null; // everyone folded to your big blind: redeal
}

// A villain's preflop action with their real cards.
function preflopMove(state, actor, cards, paramsBySeat, game, random) {
  const actions = state.streets[0].actions;
  const choice = pickWeighted(
    preflopWeights({
      state,
      actions,
      seat: actor.seat,
      cls: classOfCodes(cards[actor.seat]),
      params: paramsBySeat.get(actor.seat),
      tableSize: game.tableSize,
      openerWidth: openerWidthFor(state, actions, actor.seat, paramsBySeat),
    }),
    random
  );
  return choice === 'raise' ? preflopRaiseTo(state, game, limpersIn(actions)) : { type: choice };
}

// Heads-up / 3-way: everyone is dealt random cards and plays preflop from their read (opens, limps, 3-bets,
// 4-bets, calls, folds); you're played by a solid regular. The hand is kept only if all of you see the flop,
// so single-raised, 3-bet and 4-bet pots come up as often as these players would really play them.
function tryPostflopSpot(setup, random) {
  const { game, positions } = tableFor(setup);
  const format = FORMATS.find((f) => f.id === setup.format) ?? FORMATS[1];
  const villains = setup.villains.slice(0, format.villains);
  const count = villains.length + 1;

  // Random seats for everyone in the pot; you are one of them at random.
  const seats = [...positions.keys()].sort(() => random() - 0.5).slice(0, count);
  const heroSeat = seats[Math.floor(random() * count)];
  const villainSeats = seats.filter((s) => s !== heroSeat);
  const players = seats.map((seat) => {
    const isHero = seat === heroSeat;
    const read = isHero ? setup.hero : villains[villainSeats.indexOf(seat)];
    return {
      seat,
      position: positions[seat],
      role: isHero ? 'hero' : 'villain',
      name: isHero ? 'You' : positions[seat],
      stack: read.stackBB * game.bb,
      profile: read.profile,
    };
  });
  const paramsBySeat = new Map(players.map((p) => [p.seat, p.role === 'hero' ? HERO_AUTOPILOT : modelParams(p.profile, setup.hero.profile)]));
  const deck = createDeck(random);
  const cards = {};
  const tracker = { current: null, previous: null, betRatio: null };

  // Preflop: random cards, real decisions. Everyone still in at the flop, nobody all in, or it's redealt.
  for (const p of players) cards[p.seat] = deck.dealHand();
  let state = createHand({ players, positions, sb: game.sb, bb: game.bb, ante: game.ante });
  while (state.phase === 'action' && state.street === 'Preflop') {
    const move = preflopMove(state, currentPlayer(state), cards, paramsBySeat, game, random);
    if (move.type === 'fold' || move.type === 'allin') return null; // someone's out (or all in): redeal
    state = applyTracked(state, move, tracker);
  }
  if (state.phase !== 'board') return null;

  // Postflop: play on until it's your turn on the chosen street.
  const target = pickWeighted(TARGET_STREETS, random);
  while (true) {
    if (state.phase === 'result') return null;
    if (state.phase === 'board') {
      if (state.street === 'River' || state.street === target) return null;
      state = dealNext(state, deck.deal(BOARD_CARDS[nextStreetName(state)]), tracker);
      continue;
    }
    const actor = currentPlayer(state);
    if (actor.seat === heroSeat && state.street === target) {
      return makeSpot({ state, cards, deck: deck.cards, heroSeat, villainSeats, players, paramsBySeat, tracker, game, positions, setup });
    }
    const move = postflopAction({ state, seat: actor.seat, cards: cards[actor.seat], params: paramsBySeat.get(actor.seat), strengths: strengthsFor(state), tracker, random });
    if (actor.seat === heroSeat && move.type === 'fold') return null; // your autopilot gave up: not a spot
    state = applyTracked(state, move, tracker);
    if (state.players.find((p) => p.seat === heroSeat).allIn) return null;
  }
}

const NEXT_STREET = { Preflop: 'Flop', Flop: 'Turn', Turn: 'River' };
const nextStreetName = (state) => NEXT_STREET[state.street];

// Deal the next street, and start a new street for the donk-bet tracking.
export function dealNext(state, codes, tracker) {
  tracker.previous = tracker.current ?? tracker.previous;
  tracker.current = null;
  tracker.betRatio = null;
  return dealBoard(state, codes);
}

// Strength of every combo on the current board, from the villains' view (your cards aren't known to them).
const strengthCache = new Map();
function strengthsFor(state) {
  const key = state.board.join('');
  if (!strengthCache.has(key)) {
    if (strengthCache.size > 20) strengthCache.clear();
    strengthCache.set(key, computeStrengths(state.board.map(codeToIndex), []));
  }
  return strengthCache.get(key);
}

// ----- Playing the hand out -----

// Plays villains until you're on the clock (status 'hero'), the next street needs dealing ('board', with
// street and count), or the hand is over ('done'). Never mutates the spot it's given.
export function advance(spot, random) {
  const tracker = { ...spot.tracker };
  let state = spot.state;
  // Once you fold the hand is over for you: no need to deal it out.
  const hero = state.players.find((p) => p.seat === spot.heroSeat);
  if (hero.folded) return { ...spot, state, tracker, status: 'done', winners: [], result: -hero.invested, showdown: false, heroFolded: true };
  while (state.phase === 'action') {
    const actor = currentPlayer(state);
    if (actor.seat === spot.heroSeat) return { ...spot, state, tracker, status: 'hero' };
    const move =
      state.street === 'Preflop'
        ? preflopMove(state, actor, spot.cards, spot.paramsBySeat, spot.game, random)
        : postflopAction({ state, seat: actor.seat, cards: spot.cards[actor.seat], params: spot.paramsBySeat.get(actor.seat), strengths: strengthsFor(state), tracker, random });
    state = applyTracked(state, move, tracker);
  }
  if (state.phase === 'board') {
    const street = nextStreetName(state);
    return { ...spot, state, tracker, status: 'board', street, count: BOARD_CARDS[street] };
  }
  return { ...spot, state, tracker, status: 'done', ...finish(spot, state) };
}

// Your action; then villains play on.
export function heroAct(spot, action, random = Math.random) {
  const tracker = { ...spot.tracker };
  const state = applyTracked(spot.state, action, tracker);
  return advance({ ...spot, state, tracker }, random);
}

// Deal the next street. codes = the cards you picked, or null for random ones. A picked card that a villain
// happens to hold is swapped out of their hand for a random card, so picking never reveals their cards.
export function dealStreet(spot, codes = null, random = Math.random) {
  const deck = createDeck(random, spot.deck);
  const cards = { ...spot.cards };
  let dealt;
  if (codes) {
    dealt = codes;
    const holderOf = (code) => Object.keys(cards).find((seat) => Number(seat) !== spot.heroSeat && cards[seat].includes(code));
    // Take the free cards out of the deck first, so a swap can't hand a villain one of the picked cards.
    for (const code of codes) if (holderOf(code) === undefined) deck.take(code);
    for (const code of codes) {
      const holder = holderOf(code);
      if (holder !== undefined) cards[holder] = cards[holder].map((c) => (c === code ? deck.deal(1)[0] : c));
    }
  } else if (spot.plannedBoard?.length >= spot.count) {
    // Replays of saved hands: the cards that really came, in order.
    dealt = spot.plannedBoard.slice(0, spot.count);
  } else {
    dealt = deck.deal(spot.count);
  }
  // Picking your own card leaves the real runout behind; otherwise the planned cards are used up in order.
  const plannedBoard = codes ? [] : (spot.plannedBoard ?? []).slice(dealt.length);
  const tracker = { ...spot.tracker };
  const state = dealNext(spot.state, dealt, tracker);
  return advance({ ...spot, cards, deck: deck.cards, state, tracker, plannedBoard }, random);
}

// Cards you've seen: your hand and the board (what the card picker greys out).
export function seenCards(spot) {
  return [...spot.cards[spot.heroSeat], ...spot.state.board];
}

// Hand over: winners (by showdown, or the last player left) and your result.
function finish(spot, state) {
  const winners = state.uncontestedWinner !== undefined ? [state.uncontestedWinner] : showdownWinners(state, spot.cards) ?? [];
  return { winners, result: heroResult(state, winners), showdown: state.uncontestedWinner === undefined };
}

// The coach's record of the hand so far (the whole hand once it's done).
export function spotRecord(spot) {
  const { game, positions, state } = spot;
  return {
    stakes: { label: game.stakesLabel, sb: game.sb, bb: game.bb, ante: game.ante },
    tableSize: game.tableSize,
    positions,
    heroSeat: spot.heroSeat,
    players: spot.players.map((p) => ({ ...p, cards: spot.cards[p.seat] ?? [] })),
    streets: state.streets,
    board: state.board,
    winners: spot.winners ?? [],
    result: spot.result ?? 0,
    pot: state.pot,
    practice: { game: game.id, format: spot.setup.format },
  };
}
