// Practice spots: deals a hand at an 8-handed table where every opponent plays GTO (src/gto) with their real
// cards, and plays it until it's your turn in the kind of spot you asked for. From there you play the hand to
// the end: opponents answer with the GTO strategy for their cards, and the next cards come at random or are
// picked by you (dealStreet). Your decisions before the spot are made for you by the same GTO strategy.
//
// Formats:
//   preflop  the whole table: everyone before you acts, you make the next decision
//   hu       a heads-up pot: you take over on the flop, turn or river
//   3way     the same with three players
// Spots only come from hands the GTO players would really play that way (so 3-bet and 4-bet pots show up as
// often as they would at a table of solvers). Runs in a web worker (practice.worker.js): solves take a moment.
import { createHand, applyAction, dealBoard, currentPlayer, showdownWinners, heroResult } from '../utils/handEngine.js';
import { TABLE_POSITIONS } from '../constants/poker.js';
import { FULL_DECK, codeToIndex } from '../utils/cards.js';
import { classOf } from '../coach/combos.js';
import { PREFLOP_BY_CLASS } from '../coach/preflopTable.js';
import { createGtoHand } from '../gto/hand.js';
import { botAction } from './gtoBot.js';

// Blinds are $1/$2 in both games; tournaments add a big-blind ante and play shallower.
export const GAMES = [
  { id: 'cash', label: 'Cash game', tableSize: 8, sb: 1, bb: 2, ante: 0, defaultStackBB: 100, stakesLabel: '$1/$2' },
  { id: 'mtt', label: 'Tournament', tableSize: 8, sb: 1, bb: 2, ante: 2, defaultStackBB: 30, stakesLabel: '1/2 + ante' },
];

export const FORMATS = [
  { id: 'preflop', label: 'Preflop', description: 'A full table acts before you. Open, call, 3-bet or fold, then play the hand out.', players: null },
  { id: 'hu', label: 'Heads-up', description: 'Two players see a flop. You take over on the flop, turn or river and play to the end.', players: 2 },
  { id: '3way', label: '3-way', description: 'Three players see a flop. You take over on the flop, turn or river and play to the end.', players: 3 },
];

// Which street you take over on. Later streets need the earlier ones solved first (and a hand that ends early
// is redealt), so they come up a little less often.
const TARGET_STREETS = [['Flop', 0.55], ['Turn', 0.28], ['River', 0.17]];
const BOARD_CARDS = { Flop: 3, Turn: 1, River: 1 };
const NEXT_STREET = { Preflop: 'Flop', Flop: 'Turn', Turn: 'River' };
// Practice opponents solve each street quickly (one bet size on the street, fewer runouts sampled).
const DETAIL = 'fast';

function pickWeighted(items, random) {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}

// A deck that deals by rejection: accept(codes) gives each candidate hand a chance (0..1) of being kept.
// cards = what's left (starts as a full deck, or the given cards).
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

export const heroDecisions = (state) => state.streets.reduce((n, street) => n + street.actions.filter((a) => a.actor === 'Hero').length, 0);

// One action by the player to act: the engine follows it, then the hand does.
function act(spot, state, action) {
  spot.gto.apply(state, action);
  return applyAction(state, action);
}

// Deal the next street's cards and start its solve.
export function dealNext(spot, state, codes) {
  const next = dealBoard(state, codes);
  spot.gto.startStreet(next);
  return next;
}

// ----- Spot builder -----

// setup: { game, format, villains: [{ stackBB }], hero: { stackBB }, boardMode }
// Resolves to a spot with you on the clock, or null if none came up (call again). A spot holds everything
// needed to keep playing: { state, cards: { seat: [codes] }, deck (cards left), heroSeat, villainSeats, players,
// game, positions, setup, firstDecision, status, gto (the engine; it stays in the worker) }.
// firstDecision = how many of your decisions came before the spot (made for you), so grading can skip them.
const ATTEMPTS = { preflop: 40, hu: 300, '3way': 800 };

export async function generateSpot(setup, random = Math.random) {
  const attempts = ATTEMPTS[setup.format] ?? 40;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const spot = await tryDeal(setup, random);
    if (spot) return spot;
  }
  return null;
}

async function tryDeal(setup, random) {
  const game = GAMES.find((g) => g.id === setup.game) ?? GAMES[0];
  const format = FORMATS.find((f) => f.id === setup.format) ?? FORMATS[1];
  const positions = TABLE_POSITIONS[game.tableSize];
  const heroSeat = Math.floor(random() * positions.length);
  const villainStackBB = setup.villains?.[0]?.stackBB ?? game.defaultStackBB;
  const players = positions.map((position, seat) => {
    const isHero = seat === heroSeat;
    return { seat, position, role: isHero ? 'hero' : 'villain', name: isHero ? 'You' : position, stack: (isHero ? setup.hero.stackBB : villainStackBB) * game.bb };
  });

  // Cards for everyone. Preflop spots redeal half of your weakest hands (fewer automatic folds).
  const deck = createDeck(random);
  const cards = {};
  const classOfCodes = (codes) => classOf(codeToIndex(codes[0]), codeToIndex(codes[1]));
  cards[heroSeat] = deck.dealHand((codes) => (format.id !== 'preflop' || random() < 0.5 || PREFLOP_BY_CLASS[classOfCodes(codes)].start < 0.6 ? 1 : 0));
  for (const p of players) if (p.seat !== heroSeat) cards[p.seat] = deck.dealHand();

  let state = createHand({ players, positions, sb: game.sb, bb: game.bb, ante: game.ante });
  const stackBB = Math.min(setup.hero.stackBB, villainStackBB);
  const gto = await createGtoHand({ state, stackBB, known: cards, detail: DETAIL, seed: Math.floor(random() * 2 ** 31) });
  const spot = { cards, heroSeat, villainSeats: players.filter((p) => p.role === 'villain').map((p) => p.seat), players, game, positions, setup, gto };
  const finishSpot = (s) => ({ ...spot, state: s, deck: deck.cards, firstDecision: heroDecisions(s), status: 'hero' });

  // Preflop, everyone plays GTO with their cards (you too, unless the spot is preflop).
  while (state.phase === 'action') {
    const actor = currentPlayer(state);
    if (format.id === 'preflop' && actor.seat === heroSeat) return finishSpot(state);
    const action = botAction(gto, state, cards[actor.seat], random);
    if (format.players && actor.seat === heroSeat && action.type === 'fold') return null; // you're out: redeal
    state = act(spot, state, action);
    if (format.players && state.players.some((p) => p.allIn)) return null; // all in preflop: no postflop spot
  }
  if (format.id === 'preflop' || state.phase !== 'board') return null;
  const alive = state.players.filter((p) => !p.folded);
  if (alive.length !== format.players || !alive.some((p) => p.seat === heroSeat)) return null;

  // Postflop: play on (everyone GTO) until it's your turn on the chosen street.
  const target = pickWeighted(TARGET_STREETS, random);
  while (true) {
    if (state.phase === 'result') return null;
    if (state.phase === 'board') {
      if (state.street === 'River' || state.street === target) return null;
      state = dealNext(spot, state, deck.deal(BOARD_CARDS[NEXT_STREET[state.street]]));
      continue;
    }
    const actor = currentPlayer(state);
    if (actor.seat === heroSeat && state.street === target) return finishSpot(state);
    const action = botAction(gto, state, cards[actor.seat], random);
    if (actor.seat === heroSeat && action.type === 'fold') return null; // your autopilot gave up: not a spot
    state = act(spot, state, action);
    if (state.players.find((p) => p.seat === heroSeat).allIn) return null;
  }
}

// ----- Playing the hand out -----

// Plays opponents until you're on the clock (status 'hero'), the next street needs dealing ('board', with
// street and count), or the hand is over ('done').
export function advance(spot, random = Math.random) {
  let state = spot.state;
  // Once you fold the hand is over for you: no need to deal it out.
  const hero = state.players.find((p) => p.seat === spot.heroSeat);
  if (hero.folded) return { ...spot, state, status: 'done', winners: [], result: -hero.invested, showdown: false, heroFolded: true };
  while (state.phase === 'action') {
    const actor = currentPlayer(state);
    if (actor.seat === spot.heroSeat) return { ...spot, state, status: 'hero' };
    state = act(spot, state, botAction(spot.gto, state, spot.cards[actor.seat], random));
  }
  if (state.phase === 'board') {
    const street = NEXT_STREET[state.street];
    return { ...spot, state, status: 'board', street, count: BOARD_CARDS[street] };
  }
  return { ...spot, state, status: 'done', ...finish(spot, state) };
}

// Your action; then the opponents play on.
export function heroAct(spot, action, random = Math.random) {
  return advance({ ...spot, state: act(spot, spot.state, action) }, random);
}

// Deal the next street. codes = the cards you picked, or null for random ones. A picked card that an opponent
// happens to hold is swapped out of their hand for a random card, so picking never reveals their cards.
export function dealStreet(spot, codes = null, random = Math.random) {
  const deck = createDeck(random, spot.deck);
  const cards = { ...spot.cards };
  let dealt;
  if (codes) {
    dealt = codes;
    const holderOf = (code) => Object.keys(cards).find((seat) => Number(seat) !== spot.heroSeat && cards[seat].includes(code));
    // Take the free cards out of the deck first, so a swap can't hand an opponent one of the picked cards.
    for (const code of codes) if (holderOf(code) === undefined) deck.take(code);
    for (const code of codes) {
      const holder = holderOf(code);
      if (holder !== undefined) {
        cards[holder] = cards[holder].map((c) => (c === code ? deck.deal(1)[0] : c));
        spot.gto.know(Number(holder), cards[holder]);
      }
    }
  } else if (spot.plannedBoard?.length >= spot.count) {
    // Replays of saved hands: the cards that really came, in order.
    dealt = spot.plannedBoard.slice(0, spot.count);
  } else {
    dealt = deck.deal(spot.count);
  }
  // Picking your own card leaves the real runout behind; otherwise the planned cards are used up in order.
  const plannedBoard = codes ? [] : (spot.plannedBoard ?? []).slice(dealt.length);
  const next = { ...spot, cards, deck: deck.cards, plannedBoard };
  next.state = dealNext(next, spot.state, dealt);
  return advance(next, random);
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

// What the page gets: the spot without the engine (which stays in the worker).
export function snapshot(spot) {
  if (!spot) return null;
  const { gto, ...rest } = spot;
  return rest;
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
