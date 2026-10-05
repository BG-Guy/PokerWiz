// How strictly the coach grades (src/coach/grading.js): the loss-to-score curve, GTO's mixed plays, and the
// whole-hand accuracy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromLoss, gradeAgainstGto, gradeOf, overallAccuracy } from '../../src/coach/grading.js';

const BB = 2;
const POT = 20 * BB; // a 20 bb pot
const gradeFor = (shareOfPot) => gradeOf(scoreFromLoss(shareOfPot * POT, POT, BB)).id;

test('giving up value is graded by the share of the pot', () => {
  assert.equal(scoreFromLoss(0, POT, BB), 100);
  assert.equal(scoreFromLoss(0.004 * POT, POT, BB), 100, 'solver noise is forgiven');
  assert.equal(gradeFor(0.03), 'good');
  assert.equal(gradeFor(0.06), 'inaccuracy');
  assert.equal(gradeFor(0.1), 'inaccuracy');
  assert.equal(gradeFor(0.2), 'mistake');
  assert.equal(gradeFor(0.3), 'blunder');
});

test('the same share of a bigger pot costs more', () => {
  const big = 200 * BB;
  assert.ok(scoreFromLoss(0.05 * big, big, BB) < scoreFromLoss(0.05 * POT, POT, BB) - 10);
});

// Postflop advice: option values (chips, relative to folding) and how often GTO takes each.
const advice = (options) => ({ options: options.map(([type, frequency, ev]) => ({ type, frequency, ev })) });

test("a play GTO mixes is fine only while it costs next to nothing", () => {
  // Checking 30% of the time at the same value as betting: as good as the best play.
  const mixed = gradeAgainstGto({ advice: advice([['check', 0.3, 10], ['bet', 0.7, 10.1]]), actual: 0, potRef: POT, bb: BB });
  assert.equal(mixed.score, 100);
  // The same frequency from a quick solve that values it 8% of the pot lower: no free pass.
  const leaky = gradeAgainstGto({ advice: advice([['check', 0.3, 10], ['bet', 0.7, 10 + 0.08 * POT]]), actual: 0, potRef: POT, bb: BB });
  assert.ok(leaky.score < 80, `a leaky mix scores ${leaky.score}`);
});

test('a size GTO never uses is no longer "Good" when it gives up real value', () => {
  // Betting pot where GTO bets a third (it bets 85% of the time), losing 7% of the pot.
  const graded = gradeAgainstGto({
    advice: advice([['check', 0.15, 4], ['bet', 0.85, 4 + 0.07 * POT], ['bet', 0, 4]]),
    actual: 2,
    potRef: POT,
    bb: BB,
  });
  assert.equal(gradeOf(graded.score).id, 'inaccuracy');
});

test('a play GTO never makes is at most an Inaccuracy once it costs real value', () => {
  // Flatting where GTO always raises, giving up 4% of the pot.
  const flat = gradeAgainstGto({ advice: advice([['fold', 0, 0], ['call', 0, 10], ['raise', 1, 10 + 0.04 * POT]]), actual: 1, potRef: POT, bb: BB });
  assert.equal(gradeOf(flat.score).id, 'inaccuracy');
  // A small slip (1% of the pot) is still "Good".
  const slip = gradeAgainstGto({ advice: advice([['check', 0.01, 10], ['bet', 0.99, 10 + 0.01 * POT]]), actual: 0, potRef: POT, bb: BB });
  assert.equal(gradeOf(slip.score).id, 'good');
});

test("everyone is graded the same: there's no level setting anymore", () => {
  assert.equal(gradeAgainstGto.length, 1);
  assert.equal(scoreFromLoss(0.1 * POT, POT, BB), scoreFromLoss(0.1 * POT, POT, BB));
});

test('one blunder is not averaged away by easy decisions', () => {
  const easy = { score: 100, potRef: 3 * BB };
  const blunder = { score: 10, potRef: 20 * BB };
  const accuracy = overallAccuracy([easy, easy, easy, blunder], BB);
  assert.ok(accuracy < 55, `three easy decisions and a blunder: ${accuracy}`);
  assert.equal(overallAccuracy([easy, easy], BB), 100);
});
