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
// often as they would at a table of solvers), unless you ask for 3-bet pots only (setup.pot). Any spot can be
// played again from where you took over, with the same cards still to come or new ones (playAgain).
// Runs in a web worker (practice.worker.js): solves take a moment.
import { createHand, applyAction, dealBoard, currentPlayer, showdownWinners, heroResult, preflopRaises } from '../utils/handEngine.js';
import { TABLE_POSITIONS } from '../constants/poker.js';
import { FULL_DECK, codeToIndex } from '../utils/cards.js';
import { classOf } from '../coach/combos.js';
import { PREFLOP_BY_CLASS } from '../coach/preflopTable.js';
import { createGtoHand } from '../gto/hand.js';
import { readModels } from '../gto/players/models.js';
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

// Which pots: any (as they come at a GTO table), or only 3-bet pots (heads-up or 3-way: the pot was 3-bet
// before the flop and called; preflop: you make the 3-bet or face it after opening or calling).
export const POTS = [
  { id: 'any', label: 'Any pot' },
  { id: '3bet', label: '3-bet pots' },
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

// setup: { game, format, pot ('any' | '3bet'), villains: [{ stackBB }], hero: { stackBB }, boardMode, street? }
// Resolves to a spot with you on the clock, or null if none came up (call again). A spot holds everything
// needed to keep playing: { state, cards: { seat: [codes] }, deck (cards left), heroSeat, villainSeats, players,
// game, positions, setup, firstDecision, status, origin, gto (the engine; it stays in the worker) }.
// firstDecision = how many of your decisions came before the spot (made for you), so grading can skip them.
// origin = how the spot came about (the table and every action and card before it), to play it again.
const ATTEMPTS = { preflop: 40, hu: 300, '3way': 800 };
// 3-bet pots are rarer (most hands see one raise or none), so more deals are tried. A deal that doesn't
// become one is dropped before any postflop solve, so these are cheap.
const ATTEMPTS_3BET = { preflop: 400, hu: 2000, '3way': 6000 };

export async function generateSpot(setup, random = Math.random) {
  const attempts = (setup.pot === '3bet' ? ATTEMPTS_3BET : ATTEMPTS)[setup.format] ?? 40;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const spot = await tryDeal(setup, random);
    if (spot) return spot;
  }
  return null;
}

// A new hand at the table: the hand engine and the GTO engine (which knows everyone's cards), with nothing
// played yet. table: { game, positions, players, cards, stackBB, seed, setup }.
async function openTable(table) {
  const { game, positions, players, cards, stackBB, seed, setup } = table;
  const state = createHand({ players, positions, sb: game.sb, bb: game.bb, ante: game.ante });
  // Opponents with a read (setup.villains[0].profile, when reads are on) play their tendency; the rest GTO.
  const models = readModels(players.map((p) => ({ ...p, profile: p.role === 'villain' ? setup.villains?.[0]?.profile : null })));
  const gto = await createGtoHand({ state, stackBB, known: cards, detail: DETAIL, seed, models });
  const heroSeat = players.find((p) => p.role === 'hero').seat;
  return { cards, heroSeat, villainSeats: players.filter((p) => p.role === 'villain').map((p) => p.seat), players, game, positions, setup, gto, state };
}

// The table again, with the steps of a script (actions and dealt cards, in order) played on it: the spot as
// it was. runout = cards to deal next instead of random ones (they leave the deck).
async function rebuild(origin, { cards = origin.table.cards, runout = [] } = {}) {
  const spot = await openTable({ ...origin.table, cards });
  let state = spot.state;
  for (const step of origin.script) state = step.codes ? dealNext(spot, state, step.codes) : act(spot, state, step.action);
  const held = new Set(Object.values(cards).flat());
  const deck = origin.deck.filter((code) => !held.has(code) && !runout.includes(code));
  return { ...spot, state, deck, plannedBoard: runout, firstDecision: heroDecisions(state), status: 'hero', origin, startBoard: state.board.length };
}

// Play the spot again from where you took over: the same cards for everyone and the same action up to your
// decision. sameRunout: the board cards that came after it come again (if the hand ended early, the cards
// after those are new); otherwise new cards come (or you pick them, if that's the setup).
export async function playAgain(spot, { sameRunout = true } = {}) {
  if (!spot?.origin) throw new Error("This hand can't be played again.");
  const { origin } = spot;
  const runout = sameRunout ? spot.state.board.slice(spot.startBoard) : [];
  // Picking a card an opponent held swapped it out of their hand: with the same runout they keep the swap.
  const again = await rebuild(origin, { cards: sameRunout ? spot.cards : origin.table.cards, runout });
  const setup = runout.length ? { ...origin.table.setup, boardMode: 'random' } : origin.table.setup;
  return { ...again, setup, again: { count: (spot.again?.count ?? 0) + 1, sameRunout } };
}

async function tryDeal(setup, random) {
  const game = GAMES.find((g) => g.id === setup.game) ?? GAMES[0];
  const format = FORMATS.find((f) => f.id === setup.format) ?? FORMATS[1];
  const threeBet = setup.pot === '3bet';
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
  cards[heroSeat] = deck.dealHand((codes) => (format.id !== 'preflop' || threeBet || random() < 0.5 || PREFLOP_BY_CLASS[classOfCodes(codes)].start < 0.6 ? 1 : 0));
  for (const p of players) if (p.seat !== heroSeat) cards[p.seat] = deck.dealHand();

  const stackBB = Math.min(setup.hero.stackBB, villainStackBB);
  const table = { game, positions, players, cards, stackBB, seed: Math.floor(random() * 2 ** 31), setup };
  const spot = await openTable(table);
  const { gto } = spot;
  let state = spot.state;
  // Everything that happens before your spot, in order, so the spot can be played again (playAgain).
  const script = [];
  const play = (action) => {
    state = act(spot, state, action);
    script.push({ action });
  };
  const deal = (codes) => {
    state = dealNext(spot, state, codes);
    script.push({ codes });
  };
  const origin = (steps) => ({ table, script: steps, deck: [...deck.cards] });
  const finishSpot = (s) => ({ ...spot, state: s, deck: deck.cards, firstDecision: heroDecisions(s), status: 'hero', origin: origin([...script]), startBoard: s.board.length });

  // Preflop, everyone plays GTO with their cards (you too, unless the spot is preflop). In 3-bet pots, a
  // preflop spot is your decision the 3-bet is about: the 3-bet you make (facing one raise) or the one you
  // face; everyone (you too) plays the hand GTO first to find one, then it's rebuilt up to that decision.
  let threeBetDecision = -1;
  while (state.phase === 'action') {
    const actor = currentPlayer(state);
    if (format.id === 'preflop' && !threeBet && actor.seat === heroSeat) return finishSpot(state);
    const action = botAction(gto, state, cards[actor.seat], random);
    if (threeBet && actor.seat === heroSeat && threeBetDecision < 0) {
      const raises = preflopRaises(state);
      const raising = action.type === 'raise' || action.type === 'allin';
      // Facing a 3-bet counts once you're in the pot (you opened or called); cold, it's nearly always a fold.
      const inPot = state.streets[0].actions.some((a) => a.actor === 'Hero' && (a.verb === 'calls' || a.verb.includes('raise') || a.verb.includes('-bets') || a.verb === 'all in'));
      if ((raises === 2 && inPot) || (raises === 1 && raising)) threeBetDecision = script.length;
    }
    if (format.players && actor.seat === heroSeat && action.type === 'fold') return null; // you're out: redeal
    play(action);
    if (format.players && state.players.some((p) => p.allIn)) return null; // all in preflop: no postflop spot
  }
  if (format.id === 'preflop') {
    if (!threeBet || threeBetDecision < 0) return null;
    return rebuild(origin(script.slice(0, threeBetDecision)));
  }
  if (state.phase !== 'board') return null;
  if (threeBet && preflopRaises(state) !== 2) return null; // a single-raised (or 4-bet) pot: not this practice
  const alive = state.players.filter((p) => !p.folded);
  if (alive.length !== format.players || !alive.some((p) => p.seat === heroSeat)) return null;

  // Postflop: play on (everyone GTO) until it's your turn on the chosen street (setup.street picks it, for
  // checks like scripts/gto/leakScan.mjs; otherwise it's random).
  const target = setup.street ?? pickWeighted(TARGET_STREETS, random);
  while (true) {
    if (state.phase === 'result') return null;
    if (state.phase === 'board') {
      if (state.street === 'River' || state.street === target) return null;
      deal(deck.deal(BOARD_CARDS[NEXT_STREET[state.street]]));
      continue;
    }
    const actor = currentPlayer(state);
    if (actor.seat === heroSeat && state.street === target) return finishSpot(state);
    const action = botAction(gto, state, cards[actor.seat], random);
    if (actor.seat === heroSeat && action.type === 'fold') return null; // your autopilot gave up: not a spot
    play(action);
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
