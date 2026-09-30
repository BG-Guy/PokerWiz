// Replay a saved hand from a street: rebuild the hand up to the start of that street (seats, stacks, reads,
// every action, the board), then play it out in Practice. Villains act on their real cards when the hand
// shows them, otherwise on cards dealt from the range they had by then (the coach's read of their actions).
// The next streets bring the cards that really came, random ones, or ones you pick.
import { createHand, applyAction } from '../utils/handEngine.js';
import { FULL_DECK, RANKS, SUITS } from '../utils/cards.js';
import { COMBOS } from '../coach/combos.js';
import { prepareSavedHand } from '../coach/savedHand.js';
import { analyzeHand } from '../coach/analyzeHand.js';
import { actionType } from '../coach/replay.js';
import { defaultProfile, modelParams } from '../coach/profiles.js';
import { HERO_AUTOPILOT, advance, applyTracked, createDeck, dealNext, heroDecisions } from './generateSpot.js';

const BOARD_SIZE = { Preflop: 0, Flop: 3, Turn: 4, River: 5 };
const codeOf = (index) => RANKS[Math.floor(index / 4)] + SUITS[index % 4];

// Streets a saved hand can be replayed from: those it reached (the first action there is replaced).
export function replayStreets(hand) {
  return (hand.streets ?? []).filter((s) => s.name !== 'Preflop' && s.actions.length > 0).map((s) => s.name);
}

// Draw one hand from a range (Float64Array over COMBOS), avoiding dead cards.
function drawFromRange(weights, dead, random) {
  let total = 0;
  const live = [];
  for (let i = 0; i < COMBOS.length; i++) {
    const [a, b] = COMBOS[i].cards.map(codeOf);
    if (weights[i] <= 0 || dead.has(a) || dead.has(b)) continue;
    live.push([i, weights[i]]);
    total += weights[i];
  }
  let roll = random() * total;
  for (const [i, w] of live) {
    roll -= w;
    if (roll <= 0) return COMBOS[i].cards.map(codeOf);
  }
  return live.length ? COMBOS[live.at(-1)[0]].cards.map(codeOf) : null;
}

// options: { street: 'Flop' | 'Turn' | 'River', villainCards: 'real' | 'range', boardMode: 'real' | 'random' | 'pick',
//            profiles: { [position | 'hero']: profile } }
// Returns a Practice spot (see generateSpot.js), or { error }.
export function spotFromSavedHand(hand, { street, villainCards = 'real', boardMode = 'real', profiles = {} }, random = Math.random) {
  const prepared = prepareSavedHand(hand);
  if (prepared.error) return { error: prepared.error };
  const { record } = prepared;
  const startIndex = record.streets.findIndex((s) => s.name === street);
  if (startIndex < 1) return { error: `This hand didn't reach the ${street.toLowerCase()}.` };

  const players = record.players.map((p) => ({
    ...p,
    profile: profiles[p.role === 'hero' ? 'hero' : p.position] ?? p.profile ?? defaultProfile(),
  }));
  const hero = players.find((p) => p.role === 'hero');
  const heroProfile = hero.profile;

  // Everything before the chosen street, replayed through the engine (keeping track of who bet last).
  const before = record.streets.slice(0, startIndex);
  const tracker = { current: null, previous: null, betRatio: null };
  let state = createHand({ players, positions: record.positions, sb: record.stakes.sb, bb: record.stakes.bb, ante: record.stakes.ante ?? 0 });
  before.forEach((s, index) => {
    if (index > 0) state = dealNext(state, record.board.slice(state.board.length, BOARD_SIZE[s.name]), tracker);
    for (const action of s.actions) state = applyTracked(state, { type: actionType(action), amount: action.amount }, tracker);
  });
  if (state.phase !== 'board') return { error: `The hand was over before the ${street.toLowerCase()}.` };
  const streetCards = record.board.slice(state.board.length, BOARD_SIZE[street]);
  if (streetCards.length !== BOARD_SIZE[street] - state.board.length) return { error: `The ${street.toLowerCase()} cards aren't in this hand.` };

  // The cards still to come (turn, river) if they're known and wanted.
  const plannedBoard = boardMode === 'real' ? record.board.slice(BOARD_SIZE[street]) : [];
  const heroCards = hero.cards;
  const dead = new Set([...heroCards, ...record.board.slice(0, BOARD_SIZE[street]), ...plannedBoard]);

  // Villains still in: real cards if shown (and wanted), else cards from the range they had by then.
  const inHand = state.players.filter((p) => !p.folded && p.role === 'villain');
  const cards = { [hero.seat]: heroCards };
  const ranges = analyzeHand({ ...record, players, streets: before, board: record.board.slice(0, BOARD_SIZE[before.at(-1).name]) }, { rangesOnly: true }).ranges;
  const dealtFrom = {};
  for (const v of inHand) {
    const known = players.find((p) => p.seat === v.seat).cards ?? [];
    if (villainCards === 'real' && known.length === 2 && !known.some((c) => dead.has(c))) {
      cards[v.seat] = known;
      dealtFrom[v.seat] = 'real';
    } else {
      const drawn = drawFromRange(ranges.find((r) => r.seat === v.seat).weights, dead, random);
      if (!drawn) return { error: "Couldn't deal the villains cards that fit the hand." };
      cards[v.seat] = drawn;
      dealtFrom[v.seat] = 'range';
    }
    cards[v.seat].forEach((c) => dead.add(c));
  }
  const deck = createDeck(random, FULL_DECK.filter((c) => !dead.has(c) && !streetCards.includes(c)));

  state = dealNext(state, streetCards, tracker);
  const game = {
    id: 'replay',
    label: 'Replay',
    tableSize: record.tableSize,
    sb: record.stakes.sb,
    bb: record.stakes.bb,
    ante: record.stakes.ante ?? 0,
    openBB: 2.5,
    stakesLabel: record.stakes.label,
  };
  const spot = {
    state,
    cards,
    deck: deck.cards,
    heroSeat: hero.seat,
    villainSeats: inHand.map((v) => v.seat),
    players,
    paramsBySeat: new Map(players.map((p) => [p.seat, p.role === 'hero' ? HERO_AUTOPILOT : modelParams(p.profile, heroProfile)])),
    tracker,
    game,
    positions: record.positions,
    setup: { format: 'replay', boardMode: boardMode === 'pick' ? 'pick' : 'random', hero: { profile: heroProfile }, villains: [] },
    plannedBoard,
    firstDecision: heroDecisions(state),
    replay: { handId: hand.id, title: hand.title, street, realResult: hand.result, dealtFrom },
  };
  return advance(spot, random);
}
