// Turns a spot from a YouTube video (tests/fixtures/hungry-horse/spots.json) into a hand record the coach can
// review, by playing its actions through the real hand engine. Seats the spot doesn't name fold preflop.
import { createHand, applyAction, dealBoard, currentPlayer } from '../../src/utils/handEngine.js';
import { TABLE_POSITIONS } from '../../src/constants/poker.js';
import { applyLevel, applyPreset, defaultProfile } from '../../src/coach/profiles.js';

const BOARD_COUNT = { Preflop: 3, Flop: 1, Turn: 1 };

// A read from the spot ({ preset: 'fish', level: 'rec' }) as the profile the coach models a player with.
export const profileOf = (read) => applyLevel(applyPreset(defaultProfile(), read.preset), read.level);

// spot: one entry of spots.json. reads: give each villain the read the video describes (otherwise everyone
// is GTO). Returns { record, heroDecisions: [{ street, index }] } (index: the coach's decision number).
export function buildSpot(spot, { reads = false } = {}) {
  const { sb, bb } = spot.stakes;
  const positions = TABLE_POSITIONS[spot.tableSize];
  const players = positions.map((position, seat) => {
    const hero = position === spot.hero.position;
    const read = !hero && reads ? spot.reads?.[position] : null;
    return {
      seat,
      position,
      role: hero ? 'hero' : 'villain',
      name: hero ? 'You' : position,
      stack: spot.stacks[position] ?? spot.stacks.default,
      ...(read ? { profile: profileOf(read) } : {}),
    };
  });

  let state = createHand({ players, positions, sb, bb });
  let dealt = 0;
  const heroDecisions = [];
  for (const [position, type, amount] of spot.actions) {
    // Deal the next street when one ends, and fold the seats the spot leaves out preflop.
    for (;;) {
      if (state.phase === 'board') {
        const count = BOARD_COUNT[state.street];
        state = dealBoard(state, spot.board.slice(dealt, dealt + count));
        dealt += count;
      } else if (state.phase === 'action' && state.street === 'Preflop' && currentPlayer(state).position !== position) {
        if (currentPlayer(state).role === 'hero') throw new Error(`${spot.id}: the hero's preflop action is missing before ${position} ${type}`);
        state = applyAction(state, { type: 'fold' });
      } else break;
    }
    const actor = currentPlayer(state);
    if (state.phase !== 'action' || actor.position !== position) {
      throw new Error(`${spot.id}: ${state.street}: expected ${actor?.position ?? 'nobody'} to act, the spot has ${position} ${type}`);
    }
    if (actor.role === 'hero') heroDecisions.push({ street: state.street, index: heroDecisions.length });
    state = applyAction(state, { type, amount });
  }

  const record = {
    stakes: { label: spot.stakes.label, sb, bb, ante: 0 },
    tableSize: spot.tableSize,
    positions,
    heroSeat: positions.indexOf(spot.hero.position),
    players: players.map((p) => ({ ...p, cards: p.role === 'hero' ? spot.hero.cards : spot.shown?.[p.position] ?? [] })),
    streets: state.streets,
    board: state.board,
    winners: [],
    result: 0,
    pot: state.pot,
  };
  return { record, heroDecisions };
}

// The coach decision a key decision of the spot points at: the hero's last (or nth, from 1) decision on its street.
export function decisionIndex(heroDecisions, { street, nth }) {
  const onStreet = heroDecisions.filter((d) => d.street === street);
  const pick = nth ? onStreet[nth - 1] : onStreet[onStreet.length - 1];
  return pick ? pick.index : -1;
}
