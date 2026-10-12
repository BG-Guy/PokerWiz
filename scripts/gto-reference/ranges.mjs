// Starting ranges for the reference spots, taken from the engine's own preflop charts (so only the postflop
// is compared): each preflop line is played through the GTO engine and every player's range read as 169 class
// weights. Weights are rounded to 3 decimals once, and both solvers get exactly the same numbers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHand, applyAction, currentPlayer } from '../../src/utils/handEngine.js';
import { TABLE_POSITIONS } from '../../src/constants/poker.js';
import { CLASS_NAMES, CLASS_COUNT, expandClasses } from '../../src/gto/cards.js';
import { setChartLoader } from '../../src/gto/preflop/charts.js';
import { createGtoHand } from '../../src/gto/hand.js';

// The app's charts by default; useCharts(dir) reads another set (e.g. charts solved with a new flop model).
let chartDir = new URL('../../src/gto/preflop/charts/', import.meta.url).pathname;
setChartLoader(async (name) => new Uint8Array(readFileSync(join(chartDir, `${name}.pfc`))));
export const useCharts = (dir) => (chartDir = dir);

const POSITIONS = TABLE_POSITIONS[8];

// Preflop lines (8-handed, $1/$2 so 1 bb = 2 chips). actions: [position, type, amount in bb?] until the flop.
export const PREFLOP = {
  // Button opens 2.5 bb, big blind calls.
  srp_btn_bb: {
    stackBB: 100,
    actions: [['UTG', 'fold'], ['UTG+1', 'fold'], ['LJ', 'fold'], ['HJ', 'fold'], ['CO', 'fold'], ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'call']],
    oop: 'BB',
    ip: 'BTN',
  },
  // Cutoff opens 2.5 bb, button 3-bets to 8 bb, cutoff calls.
  '3bp_co_btn': {
    stackBB: 100,
    actions: [['UTG', 'fold'], ['UTG+1', 'fold'], ['LJ', 'fold'], ['HJ', 'fold'], ['CO', 'raise', 2.5], ['BTN', 'raise', 8], ['SB', 'fold'], ['BB', 'fold'], ['CO', 'call']],
    oop: 'CO',
    ip: 'BTN',
  },
};

const round3 = (w) => Math.round(w * 1000) / 1000;

// { oop, ip } class weights (169, max 1), pot and stacks (bb) at the flop for one preflop line.
export async function flopStart(lineId) {
  const line = PREFLOP[lineId];
  const players = POSITIONS.map((position, seat) => ({ seat, position, role: 'villain', name: position, stack: line.stackBB * 2 }));
  let state = createHand({ players, positions: POSITIONS, sb: 1, bb: 2 });
  const gto = await createGtoHand({ state, stackBB: line.stackBB });
  for (const [position, type, amountBB] of line.actions) {
    const action = { type, amount: amountBB !== undefined ? amountBB * 2 : undefined };
    if (currentPlayer(state).position !== position) throw new Error(`Expected ${currentPlayer(state).position} to act, the line has ${position}`);
    gto.apply(state, action);
    state = applyAction(state, action);
  }
  const seatOf = (position) => POSITIONS.indexOf(position);
  const classes = (position) => gto.rangeOf(state, seatOf(position)).map(round3);
  const stackBB = (position) => (state.players[seatOf(position)].stack - state.players[seatOf(position)].invested) / 2;
  return {
    oop: classes(line.oop),
    ip: classes(line.ip),
    pot: state.pot / 2,
    stack: Math.min(stackBB(line.oop), stackBB(line.ip)),
    lostPreflop: gto.lost,
  };
}

// Class weights -> TexasSolver range text ("AA,AKs:0.5,...").
export function toTexasRange(classes) {
  const parts = [];
  for (let c = 0; c < CLASS_COUNT; c++) {
    const w = classes[c];
    if (w <= 0) continue;
    parts.push(w >= 1 ? CLASS_NAMES[c] : `${CLASS_NAMES[c]}:${w}`);
  }
  return parts.join(',');
}

// Class weights -> the engine's 1326 weights.
export const toEngineRange = (classes) => expandClasses(classes);
