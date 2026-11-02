// Bankroll math: filters, the running curve, downswings, months, breakdowns and streaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bankrollSeries,
  downswings,
  currentDrawdown,
  filterSessions,
  inRange,
  monthToMonth,
  breakdown,
  streaks,
  rangeSummary,
  lengthBuckets,
  valuesOf,
} from '../../src/utils/bankroll.js';

// A cash session already in display units (bigBlind 1): profit = cashOut - buyIn.
let n = 0;
const s = (date, profit, hours = 4, extra = {}) => ({
  id: `t${++n}`,
  date,
  format: 'cash',
  game: 'NLH',
  stakes: '$1/$2',
  venue: 'Casino',
  bigBlind: 1,
  buyIn: 100,
  cashOut: 100 + profit,
  expenses: 0,
  durationMin: hours * 60,
  hands: hours * 30,
  ...extra,
});

test('the curve starts at zero and runs in date order', () => {
  const points = bankrollSeries([s('2026-03-02', -50), s('2026-03-01', 100, 2)]);
  assert.deepEqual(points.map((p) => p.bankroll), [0, 100, 50]);
  assert.deepEqual(points.map((p) => p.hours), [0, 2, 6]);
  assert.equal(points[0].date, '2026-03-01');
});

test('downswings: peak to trough, recovered or still open, biggest first', () => {
  // 0 -> 100 -> 40 -> 120 (recovered) -> 20 -> 70 (still under 120)
  const points = bankrollSeries([s('2026-01-01', 100), s('2026-01-02', -60), s('2026-01-03', 80), s('2026-01-04', -100), s('2026-01-05', 50)]);
  const list = downswings(points);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { start: 3, trough: 4, end: null, depth: 100 });
  assert.deepEqual(list[1], { start: 1, trough: 2, end: 3, depth: 60 });

  const now = currentDrawdown(points);
  assert.equal(now.below, 50);
  assert.equal(now.worst, 100);
  assert.equal(now.sessions, 2);
  assert.equal(now.hours, 8);
  assert.equal(now.peakDate, '2026-01-03');
});

test('at a new high there is no drawdown', () => {
  const now = currentDrawdown(bankrollSeries([s('2026-01-01', -20), s('2026-01-02', 50)]));
  assert.equal(now.below, 0);
  assert.equal(now.sessions, 0);
  assert.equal(currentDrawdown(bankrollSeries([])), null);
});

test('time ranges end today; filters never mix cash with tournaments', () => {
  const list = [
    s('2025-12-30', 10),
    s('2026-09-01', 10),
    s('2026-10-20', 10, 4, { venue: 'Online' }),
    s('2026-10-25', 10, 4, { format: 'tournament', bigBlind: 0 }),
  ];
  assert.equal(inRange(list, 'all', '2026-11-02').length, 4);
  assert.equal(inRange(list, 'year', '2026-11-02').length, 3);
  assert.equal(inRange(list, '30', '2026-11-02').length, 2); // Oct 4 onwards
  assert.equal(inRange(list, '90', '2026-11-02').length, 3);
  assert.equal(filterSessions(list, {}, '2026-11-02').length, 3);
  assert.equal(filterSessions(list, { format: 'tournament' }, '2026-11-02').length, 1);
  assert.equal(filterSessions(list, { venue: 'Online', range: '30' }, '2026-11-02').length, 1);
  assert.deepEqual(valuesOf(list, 'venue'), [{ value: 'Casino', count: 3 }, { value: 'Online', count: 1 }]);
});

test('month to month: change from the month before, best and worst', () => {
  const m = monthToMonth([s('2026-08-03', 200), s('2026-08-20', -50), s('2026-09-01', -80), s('2026-10-02', 40)]);
  assert.deepEqual(m.months.map((x) => [x.month, x.net, x.change]), [['2026-08', 150, null], ['2026-09', -80, -230], ['2026-10', 40, 120]]);
  assert.equal(m.latest.month, '2026-10');
  assert.equal(m.previous.month, '2026-09');
  assert.equal(m.best.month, '2026-08');
  assert.equal(m.worst.month, '2026-09');
  assert.equal(m.winningMonths, 2);
  assert.equal(monthToMonth([]), null);
});

test('summary of a range: best and worst session and the largest downswing', () => {
  const r = rangeSummary([s('2026-01-01', 100), s('2026-01-02', -150), s('2026-01-03', 30, 2)]);
  assert.equal(r.net, -20);
  assert.equal(r.hours, 10);
  assert.equal(r.biggestWin.cashOut - r.biggestWin.buyIn, 100);
  assert.equal(r.biggestLoss.cashOut - r.biggestLoss.buyIn, -150);
  assert.equal(r.largestDownswing.depth, 150);
  const none = rangeSummary([s('2026-01-01', 10)]);
  assert.equal(none.biggestLoss, null);
  assert.equal(none.largestDownswing, null);
});

test('breakdowns, session length buckets and streaks', () => {
  const list = [s('2026-01-01', 100, 2), s('2026-01-02', -30, 6, { stakes: '$2/$5' }), s('2026-01-03', -10, 4), s('2026-01-04', 20, 4)];
  const byStakes = breakdown(list, 'stakes');
  assert.deepEqual(byStakes.map((r) => [r.label, r.net, r.count]), [['$1/$2', 110, 3], ['$2/$5', -30, 1]]);
  assert.deepEqual(lengthBuckets(list).map((b) => [b.label, b.count]), [['Under 3h', 1], ['3h to 5h', 2], ['Over 5h', 1]]);
  assert.deepEqual(streaks(list), { longestWin: 1, longestLoss: 2, current: 1 });
});
