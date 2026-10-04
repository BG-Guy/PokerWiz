// Replay a saved hand from a street: rebuild the hand up to the start of that street (seats, stacks, every
// action, the board) through the GTO engine, then play it out in Practice against GTO opponents. Villains act
// on their real cards when the hand shows them, otherwise on cards dealt from the range GTO gives them for
// the way they played. The next streets bring the cards that really came, random ones, or ones you pick.
import { createHand, applyAction } from '../utils/handEngine.js';
import { FULL_DECK } from '../utils/cards.js';
import { prepareSavedHand } from '../coach/savedHand.js';
import { actionType } from '../coach/replay.js';
import { createGtoHand } from '../gto/hand.js';
import { HAND_CARDS, cardCode } from '../gto/cards.js';
import { advance, createDeck, dealNext, heroDecisions } from './generateSpot.js';

const BOARD_SIZE = { Preflop: 0, Flop: 3, Turn: 4, River: 5 };

// Streets a saved hand can be replayed from: those it reached (the first action there is replaced).
export function replayStreets(hand) {
  return (hand.streets ?? []).filter((s) => s.name !== 'Preflop' && s.actions.length > 0).map((s) => s.name);
}

// Draw one hand (two card codes) from a 1326-weight range, avoiding dead cards.
function drawFromRange(weights, dead, random) {
  let total = 0;
  const live = [];
  for (let h = 0; h < HAND_CARDS.length; h++) {
    const codes = HAND_CARDS[h].map(cardCode);
    if (!(weights[h] > 0) || dead.has(codes[0]) || dead.has(codes[1])) continue;
    live.push([codes, weights[h]]);
    total += weights[h];
  }
  let roll = random() * total;
  for (const [codes, w] of live) {
    roll -= w;
    if (roll <= 0) return codes;
  }
  return live.length ? live[live.length - 1][0] : null;
}

// options: { street: 'Flop' | 'Turn' | 'River', villainCards: 'real' | 'range', boardMode: 'real' | 'random' | 'pick' }
// Resolves to a Practice spot (see generateSpot.js), or { error }.
export async function spotFromSavedHand(hand, { street, villainCards = 'real', boardMode = 'real' }, random = Math.random) {
  const prepared = prepareSavedHand(hand);
  if (prepared.error) return { error: prepared.error };
  const { record } = prepared;
  const startIndex = record.streets.findIndex((s) => s.name === street);
  if (startIndex < 1) return { error: `This hand didn't reach the ${street.toLowerCase()}.` };

  const players = record.players;
  const hero = players.find((p) => p.role === 'hero');
  const opening = createHand({ players, positions: record.positions, sb: record.stakes.sb, bb: record.stakes.bb, ante: record.stakes.ante ?? 0 });
  const deepest = Math.max(0, ...players.filter((p) => p.role === 'villain').map((p) => p.stack));
  const gto = await createGtoHand({ state: opening, stackBB: Math.min(hero.stack, deepest || hero.stack) / record.stakes.bb, known: { [hero.seat]: hero.cards }, detail: 'fast' });
  const engine = { gto };

  // Everything before the chosen street, replayed through the hand engine and the GTO engine together.
  let state = opening;
  record.streets.slice(0, startIndex).forEach((s, index) => {
    if (index > 0) state = dealNext(engine, state, record.board.slice(state.board.length, BOARD_SIZE[s.name]));
    for (const action of s.actions) {
      const real = { type: actionType(action), amount: action.amount };
      gto.apply(state, real);
      state = applyAction(state, real);
    }
  });
  if (state.phase !== 'board') return { error: `The hand was over before the ${street.toLowerCase()}.` };
  const streetCards = record.board.slice(state.board.length, BOARD_SIZE[street]);
  if (streetCards.length !== BOARD_SIZE[street] - state.board.length) return { error: `The ${street.toLowerCase()} cards aren't in this hand.` };

  // The cards still to come (turn, river) if they're known and wanted.
  const plannedBoard = boardMode === 'real' ? record.board.slice(BOARD_SIZE[street]) : [];
  const dead = new Set([...hero.cards, ...record.board.slice(0, BOARD_SIZE[street]), ...plannedBoard]);

  // Villains still in: real cards if shown (and wanted), else cards from the range GTO gives them by now.
  const inHand = state.players.filter((p) => !p.folded && p.role === 'villain');
  const cards = { [hero.seat]: hero.cards };
  const dealtFrom = {};
  for (const v of inHand) {
    const known = players.find((p) => p.seat === v.seat).cards ?? [];
    if (villainCards === 'real' && known.length === 2 && !known.some((c) => dead.has(c))) {
      cards[v.seat] = known;
      dealtFrom[v.seat] = 'real';
    } else {
      const range = gto.handRangeOf(state, v.seat);
      const drawn = range && drawFromRange(range, dead, random);
      if (!drawn) return { error: "Couldn't deal the villains cards that fit the hand." };
      cards[v.seat] = drawn;
      dealtFrom[v.seat] = 'range';
    }
    cards[v.seat].forEach((c) => dead.add(c));
    gto.know(v.seat, cards[v.seat]);
  }
  const deck = createDeck(random, FULL_DECK.filter((c) => !dead.has(c) && !streetCards.includes(c)));

  const game = {
    id: 'replay',
    label: 'Replay',
    tableSize: record.tableSize,
    sb: record.stakes.sb,
    bb: record.stakes.bb,
    ante: record.stakes.ante ?? 0,
    stakesLabel: record.stakes.label,
  };
  const spot = {
    cards,
    deck: deck.cards,
    heroSeat: hero.seat,
    villainSeats: inHand.map((v) => v.seat),
    players,
    game,
    positions: record.positions,
    setup: { format: 'replay', boardMode: boardMode === 'pick' ? 'pick' : 'random', hero: {}, villains: [] },
    plannedBoard,
    replay: { handId: hand.id, title: hand.title, street, realResult: hand.result, dealtFrom },
    gto,
  };
  spot.state = dealNext(spot, state, streetCards);
  spot.firstDecision = heroDecisions(spot.state);
  return advance(spot, random);
}
