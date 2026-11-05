// Test helpers for the GTO engine: load the solved charts from disk, and build hand records by playing a
// script of actions through the real hand engine.
import { readFileSync } from 'node:fs';
import { setChartLoader } from '../../src/gto/preflop/charts.js';
import { createHand, applyAction, dealBoard, currentPlayer } from '../../src/utils/handEngine.js';
import { TABLE_POSITIONS } from '../../src/constants/poker.js';
import { createGtoHand } from '../../src/gto/hand.js';

// Charts straight from src/gto/preflop/charts (what the app bundles).
export function useDiskCharts() {
  setChartLoader(async (name) => new Uint8Array(readFileSync(new URL(`../../src/gto/preflop/charts/${name}.pfc`, import.meta.url))));
}

const BOARD_COUNT = { Preflop: 3, Flop: 1, Turn: 1 };

// Plays a hand: every position at the table is seated (stacks in bb), the hero at `hero.position`.
// actions: [[position, type, amountBB?]] in order; board cards are dealt when a street ends.
// Returns { record, state } (record as the coach expects it).
export function playHand({ tableSize = 8, stacksBB = 100, sb = 1, bb = 2, ante = 0, hero, cards = {}, actions, board = [] }) {
  const positions = TABLE_POSITIONS[tableSize];
  const players = positions.map((position, seat) => ({
    seat,
    position,
    role: position === hero.position ? 'hero' : 'villain',
    name: position === hero.position ? 'You' : position,
    stack: (typeof stacksBB === 'number' ? stacksBB : stacksBB[position] ?? 100) * bb,
  }));
  let state = createHand({ players, positions, sb, bb, ante });
  let dealt = 0;
  for (const [position, type, amountBB] of actions) {
    while (state.phase === 'board') {
      const count = BOARD_COUNT[state.street];
      state = dealBoard(state, board.slice(dealt, dealt + count));
      dealt += count;
    }
    const actor = currentPlayer(state);
    if (actor?.position !== position) throw new Error(`Expected ${actor?.position} to act, script has ${position}`);
    state = applyAction(state, { type, amount: amountBB !== undefined ? amountBB * bb : undefined });
  }
  const record = {
    stakes: { label: `$${sb}/$${bb}`, sb, bb, ante },
    tableSize,
    positions,
    heroSeat: positions.indexOf(hero.position),
    players: players.map((p) => ({ ...p, cards: p.role === 'hero' ? hero.cards : cards[p.position] ?? [] })),
    streets: state.streets,
    board: state.board,
    winners: [],
    result: 0,
    pot: state.pot,
  };
  return { record, state };
}

// A preflop played through the GTO engine, to get the ranges each player brings to the flop. Everyone at the
// table is seated; players the line doesn't name fold when their turn comes (after its last action too).
// line: [[position, type, amountBB?]]. Returns { state, gto, order (positions still in, postflop order),
// ranges (1326 weights each, same order), pot and stacks (bb) }.
export async function preflopLine({ tableSize = 8, stacksBB = 100, line }) {
  const bb = 2;
  const positions = TABLE_POSITIONS[tableSize];
  const players = positions.map((position, seat) => ({ seat, position, role: 'villain', name: position, stack: stacksBB * bb }));
  let state = createHand({ players, positions, sb: 1, bb });
  const gto = await createGtoHand({ state, stackBB: stacksBB });
  const act = (action) => {
    gto.apply(state, action);
    state = applyAction(state, action);
  };
  for (const [position, type, amountBB] of line) {
    while (state.phase === 'action' && currentPlayer(state).position !== position) act({ type: 'fold' });
    if (state.phase !== 'action') throw new Error(`The preflop ended before ${position} could act`);
    act({ type, amount: amountBB !== undefined ? amountBB * bb : undefined });
  }
  while (state.phase === 'action') act({ type: 'fold' });
  if (state.phase !== 'board') throw new Error('Nobody is left to see a flop');
  const alive = state.postflopOrder.map((position) => state.players.find((p) => p.position === position && !p.folded)).filter(Boolean);
  return {
    state,
    gto,
    order: alive.map((p) => p.position),
    ranges: alive.map((p) => gto.handRangeOf(state, p.seat)),
    pot: state.pot / bb,
    stacks: alive.map((p) => (p.stack - p.invested) / bb),
  };
}
