// The hand recorder's steps as plain functions, shared by the recorder (HandRecorder.jsx) and by reopening a
// saved hand for editing (restoreHand.js): what an answer does to the hand, and the line it adds to the log.
import { formatMoney } from '../../utils/format.js';
import { applyAction, currentPlayer, dealBoard, nextStreet, showdownWinners } from '../../utils/handEngine.js';

// Where a new recording starts.
export const INITIAL_WIZARD = {
  step: 'game',
  stakesLabel: '$1/$2',
  tableSize: 9, // full ring by default; 6-max is one tap away
  heroSeat: null,
  villainSeats: [],
  stacks: {}, // seat -> starting stack in dollars (string while being typed)
  profiles: {}, // seat -> player profile (coach mode)
  cards: {}, // seat -> [codes]
  hand: null, // betting engine state, from the action step on
  winners: [],
  log: [], // answered steps, shown in the carousel and the hand log
};

// Log verbs are third person ("raises to"); for the hero say "You raise to".
export const secondPerson = (verb) => verb.replace(/s(\sto)?$/, '$1');

// What a seat is called in the recorder: "You" or "Villain 2".
export const seatName = (seat, heroSeat, villainSeats) => (seat === heroSeat ? 'You' : `Villain ${villainSeats.indexOf(seat) + 1}`);

// ----- Log lines for the setup steps -----
export const gameEntry = (label, size) => ({ text: `${label} · ${size}-max` });
export const heroSeatEntry = (position) => ({ text: `You sit in the ${position}`, role: 'hero' });
export const villainsEntry = (positions) => ({ text: `Villains: ${positions.join(', ')}`, role: 'villain' });
export function stacksEntry(amounts, bb) {
  const depths = [...new Set(amounts.map((amount) => Math.round(Number(amount) / bb)))];
  return { text: depths.length === 1 ? `Everyone ${depths[0]} bb deep` : 'Stacks set' };
}
export const heroCardsEntry = (codes) => ({ text: 'Your hand', cards: codes, role: 'hero' });
export const startEntry = (knownVillainHands) => ({
  text: knownVillainHands ? `${knownVillainHands} villain ${knownVillainHands === 1 ? 'hand' : 'hands'} known` : 'Villain cards unknown',
  role: 'villain',
});

// An action by the player on the clock. Returns { next, entry, step, winners? }: the hand after it, its log
// line, the step that comes next ('action' | 'board' | 'result' | finalStep), and the winners when it ends.
export function actionStep(hand, action, { bb, cards, finalStep }) {
  const actor = currentPlayer(hand);
  const next = applyAction(hand, action);
  const logged = next.streets[next.streets.length - 1].actions.at(-1);
  const isHero = actor.role === 'hero';
  const who = isHero ? 'You' : actor.position;
  const amount = logged.amount ? ` ${formatMoney(logged.amount, { sign: false, bb })}` : '';
  let text = `${who} ${isHero ? secondPerson(logged.verb) : logged.verb}${amount}`;
  if (logged.allIn) {
    const verb = logged.verb === 'calls' ? (isHero ? 'call' : 'calls') : isHero ? 'go' : 'goes';
    text = `${who} ${verb} all in for${amount}`;
  }
  const entry = { text, role: actor.role, allIn: logged.allIn };
  if (next.phase === 'result' && next.uncontestedWinner !== undefined) return { next, entry, step: finalStep, winners: [next.uncontestedWinner] };
  if (next.phase === 'result') return { next, entry, step: 'result', winners: showdownWinners(next, cards) ?? [] };
  return { next, entry, step: next.phase === 'board' ? 'board' : 'action' };
}

// Deal the next street. If nobody can bet any more (all in), the hand moves on to the next card or the
// showdown. Returns { next, entry, step, winners? }.
export function dealStep(hand, codes, cards) {
  const next = dealBoard(hand, codes);
  const entry = { text: nextStreet(hand), cards: codes };
  if (next.phase === 'result') return { next, entry, step: 'result', winners: showdownWinners(next, cards) ?? [] };
  return { next, entry, step: next.phase };
}

// The showdown's log line: who won the pot.
export function showdownEntry(winners, hand, heroSeat, nameOf, bb) {
  const text = winners.length > 1 ? 'Split pot' : `${nameOf(winners[0])} won ${formatMoney(hand.pot, { sign: false, bb })}`;
  return { text, role: winners.includes(heroSeat) ? 'hero' : 'villain' };
}
