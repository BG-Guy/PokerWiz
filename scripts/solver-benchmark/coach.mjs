// The coach side of the benchmark: exports the coach's preflop ranges in solver format, and replays a solver
// line through the coach to get its decision for one hand. COACH_DIR picks which copy of the app to test
// (default: this repository), so an older version can be scored on the same spots.
import path from 'path';
import { fileURLToPath } from 'url';

const COACH = process.env.COACH_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (file) => import(path.join(COACH, 'src', file));
const { createHand, applyAction, dealBoard, getOptions } = await load('utils/handEngine.js');
const { analyzeHand } = await load('coach/analyzeHand.js');
const { defaultProfile, modelParams } = await load('coach/profiles.js');
const { TABLE_POSITIONS } = await load('constants/poker.js');
const { CLASS_NAMES } = await load('coach/combos.js');
const { preflopActionLikelihood } = await load('coach/preflopModel.js');

const POSITIONS = TABLE_POSITIONS[9];
export const UNIT = 10; // solver chips per dollar ($1/$2 blinds: a 110 pot is $11)
export const category = (kind) => (kind === 'bet' || kind === 'raise' || kind === 'allin' ? 'aggressive' : kind);

// The coach's button open and big blind flat-call ranges (100 bb, 9-handed), as weighted solver ranges.
export function coachRanges() {
  const params = modelParams(defaultProfile());
  const base = { limpers: 0, facingAllIn: false, callPutsAllIn: false, stackBB: 100 };
  const open = preflopActionLikelihood({ action: 'raise', position: 'BTN', tableSize: 9, situation: { ...base, raises: 1 }, params, openerWidth: 1 }).likelihood;
  const call = preflopActionLikelihood({
    action: 'call',
    position: 'BB',
    tableSize: 9,
    situation: { ...base, raises: 2, openerPosition: 'BTN' },
    params,
    openerWidth: params.widthMult,
  }).likelihood;
  const format = (lk) =>
    CLASS_NAMES.map((name, i) => [name, lk[i]])
      .filter(([, w]) => w >= 0.02)
      .map(([name, w]) => (w > 0.98 ? name : `${name}:${w.toFixed(2)}`))
      .join(',');
  return { ip: format(open), oop: format(call) };
}

// Button opens to $5, big blind calls, then the solver line (bets in solver chips) up to the hero's turn.
// Returns the coach's graded decision for the hero's hand there.
export function coachDecision({ flop, line, heroPlayer, heroCards }) {
  const players = [
    { seat: 0, position: 'BTN', role: heroPlayer === 1 ? 'hero' : 'villain', name: 'BTN', stack: 200, profile: defaultProfile() },
    { seat: 2, position: 'BB', role: heroPlayer === 0 ? 'hero' : 'villain', name: 'BB', stack: 200, profile: defaultProfile() },
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
  const report = analyzeHand({
    stakes: { label: '$1/$2', sb: 1, bb: 2 },
    tableSize: 9,
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
