// Reopens a saved hand in the recorder for editing. The hand is replayed through the recorder's own steps
// (recorderSteps.js), answer by answer, so the recorder opens on the last step with the whole hand behind it:
// Undo, or tapping a step in "Hand so far", goes back to any point to change it and record the rest again.
// Older hands without seats or stacks are rebuilt the way the coach rebuilds them (coach/savedHand.js).
import { STAKES } from '../../constants/poker.js';
import { BOARD_CARDS, createHand, currentPlayer, heroResult, nextStreet } from '../../utils/handEngine.js';
import { prepareSavedHand } from '../../coach/savedHand.js';
import { actionType } from '../../coach/replay.js';
import {
  INITIAL_WIZARD,
  actionStep,
  dealStep,
  gameEntry,
  heroCardsEntry,
  heroSeatEntry,
  seatName,
  showdownEntry,
  stacksEntry,
  startEntry,
  villainsEntry,
} from './recorderSteps.js';

const BOARD_SIZE = { Flop: 3, Turn: 4, River: 5 };

// Who won a showdown whose cards weren't all known: the winners that give the result the hand was saved with.
function winnersForResult(state, heroSeat, savedResult) {
  const live = state.players.filter((p) => !p.folded).map((p) => p.seat);
  const villains = live.filter((seat) => seat !== heroSeat);
  const candidates = [[heroSeat], ...villains.map((seat) => [seat]), live];
  return candidates.reduce((best, winners) =>
    Math.abs(heroResult(state, winners) - savedResult) < Math.abs(heroResult(state, best) - savedResult) ? winners : best
  );
}

// Returns { initial: { wizard, history }, details: { title, verdict, note, rating, tilt } } for HandRecorder,
// plus replayed: { streets, board, result } (the hand as rebuilt, to tell whether an edit changed the action),
// or { error } when the hand can't be rebuilt.
export function restoreRecorder(hand) {
  const prepared = prepareSavedHand(hand);
  if (prepared.error) return { error: prepared.error };
  const { record } = prepared;
  const { stakes, positions } = record;
  const heroSeat = record.heroSeat;
  const villainSeats = record.players.filter((p) => p.role === 'villain').map((p) => p.seat);
  const nameOf = (seat) => seatName(seat, heroSeat, villainSeats);
  const cards = Object.fromEntries(record.players.filter((p) => p.cards?.length === 2).map((p) => [p.seat, p.cards]));
  const stacks = Object.fromEntries(record.players.map((p) => [p.seat, String(p.stack)]));

  // Answer one question: the state before it goes on the history, its log line onto the log.
  const history = [];
  let wizard = {
    ...INITIAL_WIZARD,
    stakesLabel: stakes.label,
    tableSize: record.tableSize,
    // Stakes the recorder's list doesn't have travel with the hand.
    customStakes: STAKES.some((s) => s.label === stakes.label) ? undefined : stakes,
  };
  const answer = (changes, entry) => {
    const at = history.length;
    history.push(wizard);
    wizard = { ...wizard, ...changes, log: entry ? [...wizard.log, { ...entry, at }] : wizard.log };
  };

  // Setup: game, your seat, the villains, stacks, cards (villains' seats and cards are picked within a step).
  answer({ step: 'hero', heroSeat: null, villainSeats: [], cards: {}, profiles: {} }, gameEntry(stakes.label, record.tableSize));
  answer({ step: 'villains', heroSeat, villainSeats: [] }, heroSeatEntry(positions[heroSeat]));
  wizard = { ...wizard, villainSeats };
  answer({ step: 'stacks', stacks }, villainsEntry(villainSeats.map((seat) => positions[seat])));
  answer({ step: 'heroCards' }, stacksEntry([heroSeat, ...villainSeats].map((seat) => stacks[seat]), stakes.bb));
  answer({ step: 'villainCards', cards: { [heroSeat]: cards[heroSeat] } }, heroCardsEntry(cards[heroSeat]));
  wizard = { ...wizard, cards };
  const players = [heroSeat, ...villainSeats].map((seat) => ({
    seat,
    position: positions[seat],
    role: seat === heroSeat ? 'hero' : 'villain',
    name: nameOf(seat),
    stack: Number(stacks[seat]),
  }));
  let state = createHand({ players, positions, sb: stakes.sb, bb: stakes.bb });
  answer({ step: 'action', hand: state }, startEntry(villainSeats.filter((seat) => cards[seat]?.length === 2).length));

  // The action, street by street, dealing the board in between.
  const move = ({ next, entry, step, winners }) => {
    answer({ hand: next, step, ...(winners ? { winners } : {}) }, entry);
    state = next;
  };
  for (const [index, street] of record.streets.entries()) {
    if (index > 0) {
      if (wizard.step !== 'board') break;
      move(dealStep(state, record.board.slice(state.board.length, BOARD_SIZE[street.name]), cards));
    }
    for (const action of street.actions) {
      if (wizard.step !== 'action' || !currentPlayer(state)) break;
      move(actionStep(state, { type: actionType(action), amount: action.amount }, { bb: stakes.bb, cards, finalStep: 'details' }));
    }
  }
  // An all-in runout the log didn't spell out: deal the rest of the saved board.
  while (wizard.step === 'board' && record.board.length >= state.board.length + BOARD_CARDS[nextStreet(state)]) {
    const count = BOARD_CARDS[nextStreet(state)];
    move(dealStep(state, record.board.slice(state.board.length, state.board.length + count), cards));
  }

  // The end: showdown winners (from the cards, or the saved result), or the rest was skipped.
  if (wizard.step === 'result') {
    const winners = wizard.winners.length ? wizard.winners : winnersForResult(state, heroSeat, hand.result);
    wizard = { ...wizard, winners };
    answer({ step: 'details' }, showdownEntry(winners, state, heroSeat, nameOf, stakes.bb));
  } else if (wizard.step !== 'details') {
    answer({ step: 'details', winners: [] }, { text: 'Skipped the rest of the hand' });
  }

  return {
    initial: { wizard, history },
    replayed: { streets: state.streets, board: state.board, result: heroResult(state, wizard.winners) },
    details: { title: hand.title, verdict: hand.verdict, note: hand.note ?? '', rating: hand.rating ?? 0, tilt: hand.tilt ?? null },
  };
}
