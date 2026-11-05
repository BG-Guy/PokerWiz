// Range play from common spots, end to end: every player brings a range that fits their seat and what they did
// (limps included), and the solver plays range against range. It bets where the board favours its range and
// holds back where it doesn't, attacks a capped range, and bets for value against the worse hands a range holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDiskCharts, playHand, preflopLine } from './helpers.mjs';
import { solvePostflop } from '../../src/gto/postflop/solver.js';
import { analyzeHand } from '../../src/coach/analyzeHand.js';
import { cardId, HAND_CARDS, CLASS_NAMES, collapseToClasses } from '../../src/gto/cards.js';

useDiskCharts();

// Share of all combos in a range (1326 weights, each 0..1).
const width = (range) => range.reduce((sum, w) => sum + w, 0) / 1326;

// A class's weight in a range, relative to the range's heaviest class.
function classWeight(range, name) {
  const classes = collapseToClasses(range);
  return classes[CLASS_NAMES.indexOf(name)] / Math.max(...classes);
}

// The flop after the first player checks, solved quickly and the same way every run.
const solveFlop = (spot, board, ranges = spot.ranges) =>
  solvePostflop({ board: board.map(cardId), ranges, pot: spot.pot, stacks: spot.stacks, path: [{ player: 0, type: 'check' }], detail: 'fast', iterations: 120, ms: 1e9, seed: 3 });

// Share of the acting player's range (as it reaches the node) that bets or raises there.
function aggression(sol, node) {
  const p = node.player;
  const n = sol.lists[p].count;
  const strategy = sol.strategy(node);
  const reach = node.reachHere[p];
  let total = 0;
  let aggressive = 0;
  for (let k = 0; k < n; k++) total += reach[k];
  node.actions.forEach((action, a) => {
    if (action.type === 'check' || action.type === 'call' || action.type === 'fold') return;
    for (let k = 0; k < n; k++) aggressive += reach[k] * strategy[a * n + k];
  });
  return aggressive / total;
}

// How often GTO bets or raises in a graded decision.
const betting = (decision) => decision.options.filter((o) => o.kind === 'raise').reduce((sum, o) => sum + o.frequency, 0);

const BTN_VS_BB = [['BTN', 'raise', 2.5], ['BB', 'call']];
// 9-handed: UTG limps, the button isolates, the big blind 3-bets, UTG folds, the button calls.
const LIMP_ISO_3BET = [['UTG', 'call'], ['BTN', 'raise', 3.33], ['BB', 'raise', 11.67], ['UTG', 'fold'], ['BTN', 'call']];
// 9-handed, every seat in order: UTG limps and everyone folds round to `last` (who acts next).
const NINE_LIMP_TO = (last) => {
  const seats = ['UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  return [['UTG', 'call'], ...seats.slice(0, seats.indexOf(last)).map((p) => [p, 'fold'])];
};

test('the big blind defends a wider range against a button open than against an UTG open, and flats small pairs', async () => {
  const vsButton = await preflopLine({ line: BTN_VS_BB });
  const vsUtg = await preflopLine({ line: [['UTG', 'raise', 2.5], ['BB', 'call']] });
  const [wide, narrow] = [width(vsButton.ranges[0]), width(vsUtg.ranges[0])];
  // The old charts called 39% and 13% (folding about half the hands against the button, 83% against UTG).
  assert.ok(wide > 0.5 && narrow > 0.18, `the big blind calls ${wide} of hands against the button, ${narrow} against UTG`);
  assert.ok(wide > 2 * narrow, `the big blind calls ${wide} of hands against the button, ${narrow} against UTG`);
  // Pairs set-mine: against the button, 22-99 are called, never 3-bet (the old charts 3-bet 55 to 99 every time,
  // and before that 64% of 22-66). Node-locked to flat a single raise (premiums.js).
  for (const name of ['22', '33', '44', '55', '66', '77', '88', '99']) {
    const called = classWeight(vsButton.ranges[0], name);
    assert.ok(called > 0.9, `${name} is in the big blind's calling range at ${called.toFixed(2)}`);
  }
});

test('middle pairs flat a single raise instead of 3-betting it, from the blinds and in position', async () => {
  const bbThreeBet = await preflopLine({ line: [['BTN', 'raise', 2.5], ['BB', 'raise', 9.4], ['BTN', 'call']] });
  const btnThreeBet = await preflopLine({ line: [['CO', 'raise', 2.5], ['BTN', 'raise', 7.5], ['CO', 'call']] });
  const threeBettor = (spot, position) => spot.ranges[spot.order.indexOf(position)];
  for (const [spot, position] of [[bbThreeBet, 'BB'], [btnThreeBet, 'BTN']]) {
    for (const name of ['22', '55', '77', '99']) {
      const weight = classWeight(threeBettor(spot, position), name);
      assert.ok(weight < 0.05, `${position} 3-bets ${name} at ${weight.toFixed(2)}`);
    }
    // The premiums are still the 3-bet range.
    assert.ok(classWeight(threeBettor(spot, position), 'AA') > 0.5);
  }
  // And the pairs are in the calling range that sees a flop.
  const btnCalls = await preflopLine({ line: [['CO', 'raise', 2.5], ['BTN', 'call']] });
  for (const name of ['44', '77', '99']) assert.ok(classWeight(btnCalls.ranges[btnCalls.order.indexOf('BTN')], name) > 0.5, `${name} is in the button's calling range`);
});

test('a limp keeps every later raise at its real level', async () => {
  // Before limps were understood, the limp read as an open, the iso-raise as a 3-bet and the big blind's 3-bet
  // as a cold 4-bet: a range of about AA-JJ and AK (2% of hands), against which QQ checked and folded.
  const spot = await preflopLine({ tableSize: 9, line: LIMP_ISO_3BET });
  assert.equal(spot.gto.lost, null);
  assert.deepEqual(spot.order, ['BB', 'BTN']);
  const bb = spot.ranges[0];
  assert.ok(width(bb) > 0.06, `the big blind 3-bets ${width(bb)} of hands`);
  for (const hand of ['AQs', 'KQs', 'TT']) assert.ok(classWeight(bb, hand) > 0.3, `the big blind 3-bets ${hand}`);
});

test("a limper's range is wide with few premiums, and the big blind's check is capped too", async () => {
  const spot = await preflopLine({ tableSize: 9, line: [['UTG', 'call'], ['BB', 'check']] });
  const [bb, utg] = spot.ranges;
  assert.ok(width(utg) > 0.15, `UTG limps ${width(utg)} of hands`);
  assert.ok(classWeight(utg, 'AA') <= 0.3, 'aces are usually raised, not limped');
  assert.ok(classWeight(utg, 'A9s') > 0.9 && classWeight(utg, 'KQo') > 0.9, 'playable hands limp');
  // The big blind raises its strong hands and checks the rest (out of position, so not too many raises).
  assert.ok(classWeight(bb, 'AA') < 0.05, 'the big blind raises aces');
  assert.ok(width(bb) > 0.65, `the big blind checks ${width(bb)} of hands`);
});

test('facing a limper, the coach raises strong hands and checks or folds the rest, and says the spot is approximate', async () => {
  const decision = async (position, cards) => {
    const { record } = playHand({ tableSize: 9, hero: { position, cards }, actions: [...NINE_LIMP_TO(position), [position, position === 'BB' ? 'check' : 'fold']] });
    return (await analyzeHand(record, { detail: 'fast' })).decisions[0];
  };
  const bbAces = await decision('BB', ['Ah', 'Ad']);
  assert.equal(bbAces.best.type, 'raise');
  assert.match(bbAces.chartNote, /limped pots/);
  assert.equal((await decision('BB', ['7h', '2d'])).best.type, 'check');
  // The button isolates queens; the bottom of its opening range (K8o) doesn't raise a limper.
  assert.equal((await decision('BTN', ['Qh', 'Qd'])).best.type, 'raise');
  const k8 = await decision('BTN', ['Kh', '8d']);
  assert.ok(betting(k8) < 0.5, `the button raises K8o over a limper ${betting(k8)} of the time`);
});

test('QQ isolates the limper and bets when the 3-bettor checks J85 (value against AK, AQ, AT)', async () => {
  const { record } = playHand({
    tableSize: 9,
    sb: 1,
    bb: 3,
    hero: { position: 'BTN', cards: ['Qh', 'Qd'] },
    board: ['5c', '8c', 'Jh'],
    actions: [...NINE_LIMP_TO('BTN'), ['BTN', 'raise', 3.33], ['SB', 'fold'], ['BB', 'raise', 11.67], ['UTG', 'fold'], ['BTN', 'call'], ['BB', 'check'], ['BTN', 'bet', 12.33], ['BB', 'fold']],
  });
  const report = await analyzeHand(record, { detail: 'fast' });
  const [iso, , flop] = report.decisions;
  assert.equal(iso.score, 100, `the iso-raise with queens scores ${iso.score}`);
  assert.equal(flop.street, 'Flop');
  assert.ok(betting(flop) > 0.6, `GTO bets queens ${betting(flop)} of the time`);
  assert.ok(flop.score >= 85, `the half-pot bet scores ${flop.score}`);
});

test('the raiser bets more where the board favours its range, and the defender leads more where it favours theirs', async () => {
  const spot = await preflopLine({ line: BTN_VS_BB });
  const dry = solveFlop(spot, ['Kh', '7d', '2c']);
  const low = solveFlop(spot, ['7h', '6h', '5c']);
  const [raiserDry, raiserLow] = [aggression(dry, dry.pathNodes[1]), aggression(low, low.pathNodes[1])];
  const [defenderDry, defenderLow] = [aggression(dry, dry.pathNodes[0]), aggression(low, low.pathNodes[0])];
  assert.ok(raiserDry > 0.6 && raiserDry > raiserLow + 0.15, `the button bets ${raiserDry} on K72, ${raiserLow} on 765`);
  assert.ok(defenderLow > defenderDry + 0.08, `the big blind leads ${defenderLow} on 765, ${defenderDry} on K72`);
});

test('a capped range gets attacked: against high cards only, the button bets 7-6-5 almost every time', async () => {
  const spot = await preflopLine({ line: BTN_VS_BB });
  const board = ['7h', '6h', '5c'];
  // The big blind's range without a single 4-9 or pocket pair: no pair, straight or draw on this board.
  const capped = Float32Array.from(spot.ranges[0], (w, h) => {
    const [a, b] = HAND_CARDS[h].map((card) => card >> 2);
    const connects = (rank) => rank >= 2 && rank <= 7;
    return a === b || connects(a) || connects(b) ? 0 : w;
  });
  const normal = solveFlop(spot, board);
  const attacked = solveFlop(spot, board, [capped, spot.ranges[1]]);
  const [before, after] = [aggression(normal, normal.pathNodes[1]), aggression(attacked, attacked.pathNodes[1])];
  assert.ok(after > 0.9 && after > before + 0.25, `the button bets ${after} against the capped range, ${before} against the real one`);
});

test("the iso-raiser bets a king-high board against the limper's capped range", async () => {
  const spot = await preflopLine({ tableSize: 9, line: [['UTG', 'call'], ['BTN', 'raise', 4], ['UTG', 'call']] });
  assert.deepEqual(spot.order, ['UTG', 'BTN']);
  const sol = solveFlop(spot, ['Kh', '7d', '2c']);
  const raiser = aggression(sol, sol.pathNodes[1]);
  assert.ok(raiser > 0.8, `the button bets ${raiser} when the limper checks`);
});
