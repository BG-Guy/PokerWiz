// Replays a recorded hand through the betting engine, one action at a time, so the coach can look at
// every decision in its exact spot (pot, price, stacks, board, who is still in).
import { createHand, applyAction, dealBoard, currentPlayer } from '../utils/handEngine.js';

const VERB_TYPES = { folds: 'fold', checks: 'check', calls: 'call', bets: 'bet', 'all in': 'allin', shoves: 'allin' };
const BOARD_SIZE = { Preflop: 0, Flop: 3, Turn: 4, River: 5 };

// Engine action type for a logged action. New hands store it; older ones are read from the verb.
export function actionType(action) {
  if (action.type) return action.type;
  return VERB_TYPES[action.verb] ?? 'raise'; // "raises to", "3-bets to", "re-raises to"
}

// record: { players: [{ seat, position, role, name, stack }], positions, stakes: { sb, bb }, streets, board }
// visit({ state, action, type, street, streetIndex, actionsSoFar }) is called before each action is applied.
// Returns the final engine state. Throws if the log doesn't match the table (e.g. a hand without stacks).
export function replayHand(record, visit) {
  let state = createHand({
    players: record.players.map(({ seat, position, role, name, stack }) => ({ seat, position, role, name, stack })),
    positions: record.positions,
    sb: record.stakes.sb,
    bb: record.stakes.bb,
  });

  record.streets.forEach((street, streetIndex) => {
    if (streetIndex > 0) {
      const cards = record.board.slice(state.board.length, BOARD_SIZE[street.name]);
      state = dealBoard(state, cards);
    }
    street.actions.forEach((action, index) => {
      const actor = currentPlayer(state);
      const expected = actor ? (actor.role === 'hero' ? 'Hero' : actor.position) : null;
      if (expected !== action.actor) {
        throw new Error(`The hand log doesn't line up with the table (${street.name}: expected ${expected}, got ${action.actor}).`);
      }
      const type = actionType(action);
      visit({ state, action, type, street: street.name, streetIndex, actionsSoFar: street.actions.slice(0, index) });
      state = applyAction(state, { type, amount: action.amount });
    });
  });
  return state;
}

// True when the player acts last among those still in the hand (postflop order).
export function isInPosition(state, seat) {
  const active = state.postflopOrder
    .map((position) => state.players.find((p) => p.position === position && !p.folded))
    .filter(Boolean);
  return active.length > 0 && active[active.length - 1].seat === seat;
}
