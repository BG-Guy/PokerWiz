// The coach side of the benchmark: the coach's preflop ranges (the GTO engine's charts) in solver format, and
// the coach's graded decision for one hand at a point of a solver line. COACH_DIR picks which copy of the app
// to test (default: this repository), so another version can be scored on the same spots.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const COACH = process.env.COACH_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (file) => import(path.join(COACH, 'src', file));
const { createHand, applyAction, dealBoard, getOptions } = await load('utils/handEngine.js');
const { analyzeHand } = await load('coach/analyzeHand.js');
const { TABLE_POSITIONS } = await load('constants/poker.js');
const { CLASS_NAMES } = await load('gto/cards.js');
const { setChartLoader } = await load('gto/preflop/charts.js');
const { createGtoHand } = await load('gto/hand.js');
setChartLoader(async (name) => new Uint8Array(fs.readFileSync(path.join(COACH, 'src', 'gto', 'preflop', 'charts', `${name}.pfc`))));

const POSITIONS = TABLE_POSITIONS[8];
export const UNIT = 10; // solver chips per dollar ($1/$2 blinds: a 110 pot is $11)
export const category = (kind) => (kind === 'bet' || kind === 'raise' || kind === 'allin' ? 'aggressive' : kind);

// The button's open and the big blind's flat-call ranges (100 bb, 8-handed GTO charts), as weighted solver ranges.
export async function coachRanges() {
  const players = POSITIONS.map((position, seat) => ({ seat, position, role: position === 'BTN' ? 'hero' : 'villain', name: position, stack: 200 }));
  let state = createHand({ players, positions: POSITIONS, sb: 1, bb: 2 });
  const gto = await createGtoHand({ state, stackBB: 100 });
  // Folded to the button, who opens to 2.5 bb; the small blind folds and the big blind calls.
  for (const action of [{ type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'raise', amount: 5 }, { type: 'fold' }, { type: 'call' }]) {
    gto.apply(state, action);
    state = applyAction(state, action);
  }
  const format = (grid) =>
    CLASS_NAMES.map((name, i) => [name, grid[i]])
      .filter(([, w]) => w >= 0.02)
      .map(([name, w]) => (w > 0.98 ? name : `${name}:${w.toFixed(2)}`))
      .join(',');
  return { ip: format(gto.rangeOf(state, 0)), oop: format(gto.rangeOf(state, 2)) };
}

// Button opens to $5, big blind calls, then the solver line (bets in solver chips) up to the hero's turn.
// Resolves to the coach's graded decision for the hero's hand there.
export async function coachDecision({ flop, line, heroPlayer, heroCards }) {
  const players = [
    { seat: 0, position: 'BTN', role: heroPlayer === 1 ? 'hero' : 'villain', name: 'BTN', stack: 200 },
    { seat: 2, position: 'BB', role: heroPlayer === 0 ? 'hero' : 'villain', name: 'BB', stack: 200 },
  ];
  for (const p of players) p.cards = p.role === 'hero' ? heroCards : [];
  let state = createHand({ players, positions: POSITIONS, sb: 1, bb: 2 });
  state = applyAction(state, { type: 'raise', amount: 5 });
  state = applyAction(state, { type: 'call' });
  state = dealBoard(state, flop);
  for (const step of line) {
    if (step.deal) state = dealBoard(state, [step.deal]);
    else if (step.kind === 'allin') state = applyAction(state, { type: 'allin' });
    else if (step.kind === 'bet' || step.kind === 'raise') state = applyAction(state, { type: step.kind, amount: step.amount / UNIT });
    else state = applyAction(state, { type: step.kind });
  }
  // Any action will do: the coach values every option at the hero's decision.
  state = applyAction(state, { type: getOptions(state).canCheck ? 'check' : 'call' });
  const report = await analyzeHand({
    stakes: { label: '$1/$2', sb: 1, bb: 2 },
    tableSize: 8,
    positions: POSITIONS,
    heroSeat: heroPlayer === 1 ? 0 : 2,
    players,
    streets: state.streets,
    board: state.board,
    winners: [],
    result: 0,
    pot: state.pot,
  });
  return report.decisions.at(-1);
}
