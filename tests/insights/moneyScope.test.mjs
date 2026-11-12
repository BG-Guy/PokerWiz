// When a total can be shown in big blinds: only when the BB/$ switch asks for them and everything in the total
// was played at one big blind. Otherwise it's in dollars, and the screen says why.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handScope, handsForDisplay, mixedStakesNote, moneyScope, setMoneyUnit, sharedBigBlind } from '../../src/utils/format.js';
import { summarize } from '../../src/utils/stats.js';

afterEach(() => setMoneyUnit('bb'));

const session = (stakes, bigBlind, profit, extra = {}) => ({ id: `${stakes}${profit}`, date: '2026-09-01', format: 'cash', game: 'NLH', stakes, bigBlind, venue: 'Casino', buyIn: 300, cashOut: 300 + profit, expenses: 0, durationMin: 120, hands: 60, ...extra });
const hand = (stakes, result) => ({ id: `${stakes}${result}`, stakes, result, potSize: Math.abs(result) * 2, streets: [{ name: 'Preflop', pot: 4, actions: [{ actor: 'Hero', verb: 'raises to', amount: 8 }] }], players: [{ stack: 300 }] });

test('the big blind a group shares', () => {
  assert.equal(sharedBigBlind([3, 3, 3]), 3);
  assert.equal(sharedBigBlind([2, 3]), null);
  assert.equal(sharedBigBlind([3, null]), null); // a tournament has none
  assert.equal(sharedBigBlind([]), null);
});

test('one stake: in big blinds, each session by its big blind', () => {
  setMoneyUnit('bb');
  const scope = moneyScope([session('$1/$3', 3, 300), session('$1/$3', 3, -150)]);
  assert.equal(scope.inBB, true);
  assert.equal(scope.mixed, false);
  assert.equal(scope.bb, 1);
  assert.equal(summarize(scope.sessions).net, 50); // +100 bb and -50 bb
  assert.equal(scope.money.full(50), '+50 bb');
  assert.equal(mixedStakesNote(scope), null);
});

test('different blinds: in dollars, with the reason; +300 bb at $1/$2 and -100 bb at $5/$10 is a loss', () => {
  setMoneyUnit('bb');
  const sessions = [session('$1/$2', 2, 600), session('$5/$10', 10, -1000)];
  const scope = moneyScope(sessions);
  assert.equal(scope.inBB, false);
  assert.equal(scope.mixed, true);
  assert.equal(scope.bb, null);
  assert.equal(scope.sessions, sessions); // untouched: still dollars
  assert.equal(summarize(scope.sessions).net, -400);
  assert.equal(scope.money.full(-400), '-$400');
  assert.match(mixedStakesNote(scope), /\$1\/\$2, \$5\/\$10/);
  assert.match(mixedStakesNote(scope, 'Pick one stake.'), /Pick one stake\.$/);
});

test('the switch on dollars: always dollars, and nothing to explain', () => {
  setMoneyUnit('$');
  const one = moneyScope([session('$1/$3', 3, 300)]);
  assert.equal(one.inBB, false);
  assert.equal(one.mixed, false);
  assert.equal(one.money.full(300), '+$300');
  assert.equal(moneyScope([session('$1/$2', 2, 10), session('$2/$5', 5, 10)]).mixed, false);
});

test('tournaments have no big blind: dollars, and that is not "mixed blinds"', () => {
  setMoneyUnit('bb');
  const scope = moneyScope([session('', null, 500, { format: 'tournament' }), session('', null, -100, { format: 'tournament' })]);
  assert.equal(scope.inBB, false);
  assert.equal(scope.mixed, false);
  assert.equal(moneyScope([]).inBB, false);
});

test('the stakes in a group are listed most played first', () => {
  const scope = moneyScope([session('$1/$2', 2, 1), session('$1/$3', 3, 2), session('$1/$3', 3, 3)]);
  assert.deepEqual(scope.stakes, ['$1/$3', '$1/$2']);
});

test('hands follow the same rule for totals; a line about one hand always uses its own stakes', () => {
  setMoneyUnit('bb');
  const same = handScope([hand('$1/$3', 90), hand('$1/$3', -30)]);
  assert.equal(same.inBB, true);
  assert.deepEqual(same.hands.map((h) => h.result), [30, -10]);
  assert.equal(same.hands[0].streets[0].actions[0].amount, 8 / 3);

  const mixed = handScope([hand('$1/$3', 90), hand('$1/$2', -30)]);
  assert.equal(mixed.inBB, false);
  assert.equal(mixed.mixed, true);
  assert.deepEqual(mixed.hands.map((h) => h.result), [90, -30]);

  assert.deepEqual(handsForDisplay([hand('$1/$3', 90), hand('$1/$2', -30)]).map((h) => h.result), [30, -15]);
  setMoneyUnit('$');
  assert.deepEqual(handsForDisplay([hand('$1/$3', 90)]).map((h) => h.result), [90]);
});
