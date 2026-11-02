// Bankroll insights: downswing status, the per-hour variance estimate, the "is it normal?" simulation and the
// pep line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  downswingStatus,
  hourlyVariance,
  simulateWorstDownswings,
  chanceOfDownswing,
  chanceInWords,
  varianceCheck,
  pepTalk,
  bankrollInsights,
  PEP_LINES,
} from '../../src/utils/sessionInsights.js';
import { createRandom } from '../../src/coach/random.js';

let n = 0;
const s = (date, profit, hours = 4) => ({
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
});
const day = (i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;

// A player who wins `rate` per hour with `sd` per hour, over `count` four-hour sessions (seeded).
function player(count, rate, sd, seed = 7, tail = []) {
  const random = createRandom(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const list = Array.from({ length: count }, (_, i) => s(day(i), Math.round(rate * 4 + sd * 2 * normal())));
  return [...list, ...tail.map((profit, i) => s(day(count + i), profit))];
}

test('downswing status: a few big blinds under the peak still counts as at the peak', () => {
  const near = downswingStatus([s('2026-01-01', 100), s('2026-01-02', 80), s('2026-01-03', -5)]);
  assert.equal(near.below, 5);
  assert.equal(near.inDownswing, false);
  const down = downswingStatus([s('2026-01-01', 100), s('2026-01-02', -90), s('2026-01-03', -60)]);
  assert.equal(down.inDownswing, true);
  assert.equal(down.below, 150);
  assert.equal(down.sessions, 2);
});

test('hourly variance recovers the win rate and standard deviation it was built from', () => {
  const v = hourlyVariance(player(400, 5, 60));
  assert.ok(Math.abs(v.winRate - 5) < 3.5, `win rate ${v.winRate}`);
  assert.ok(Math.abs(v.sd - 60) < 6, `sd ${v.sd}`);
  assert.equal(hourlyVariance([s('2026-01-01', 10)]), null);
});

test('simulation: seeded, and the deepest downswing of a driftless walk matches theory', () => {
  // Expected max drawdown of Brownian motion with no drift: sqrt(pi / 2) * sd * sqrt(T) = 12.5 for sd 1, T 100.
  const worst = simulateWorstDownswings({ winRate: 0, sd: 1, hours: 100, runs: 3000 });
  const average = worst.reduce((a, b) => a + b, 0) / worst.length;
  assert.ok(average > 11 && average < 13.2, `average deepest downswing ${average}`);
  assert.deepEqual(simulateWorstDownswings({ winRate: 1, sd: 5, hours: 50, runs: 50 }), simulateWorstDownswings({ winRate: 1, sd: 5, hours: 50, runs: 50 }));
  // A better win rate makes a given downswing less likely.
  const slow = chanceOfDownswing(simulateWorstDownswings({ winRate: 0.5, sd: 10, hours: 200, runs: 1000 }), 60);
  const fast = chanceOfDownswing(simulateWorstDownswings({ winRate: 3, sd: 10, hours: 200, runs: 1000 }), 60);
  assert.ok(fast < slow);
});

test('chance in plain words', () => {
  assert.equal(chanceInWords(0.344), 'About 34 in 100');
  assert.equal(chanceInWords(0.004), 'Fewer than 1 in 100');
  assert.equal(chanceInWords(0.99), 'Almost all');
});

test('is it normal: too little data is said plainly', () => {
  const check = varianceCheck([s('2026-01-01', 10), s('2026-01-02', -20)]);
  assert.equal(check.status, 'not-enough');
  assert.equal(check.sessionsNeeded, 8);
  assert.equal(check.hoursNeeded, 22);
});

test('is it normal: an ordinary downswing reads as normal, a huge one as unusual', () => {
  const ordinary = varianceCheck(player(60, 4, 50, 11, [-80, -60]));
  assert.ok(['common', 'normal'].includes(ordinary.status), `${ordinary.status} ${ordinary.chance}`);
  assert.equal(ordinary.which, 'current');
  assert.match(ordinary.sentence, /in 100 players with your win rate and swings see a downswing as deep as this one \(-[\d.]+ bb at its worst\) over \d+ hours/);

  // 30 straight losing sessions for a strong winner: a slide far deeper than these numbers produce.
  const huge = varianceCheck(player(300, 10, 50, 11, Array(30).fill(-200)));
  assert.equal(huge.status, 'unusual');
  assert.ok(huge.meaning[0].includes('bad luck'));
});

test('pep line fits the moment and stays the same until you play again', () => {
  const early = pepTalk([s('2026-01-01', 10)]);
  assert.equal(early.mood, 'early');
  const down = pepTalk(player(30, 4, 50, 3, [-500]));
  assert.equal(down.mood, 'downswing');
  assert.ok(PEP_LINES.downswing.includes(down.text));
  const peak = pepTalk(player(30, 4, 50, 3, [5000]));
  assert.equal(peak.mood, 'peak');
});

test('all the cards in one pass', () => {
  const insights = bankrollInsights(player(40, 4, 50, 5));
  assert.equal(insights.played.sessions, 40);
  assert.equal(insights.played.hours, 160);
  assert.equal(insights.played.averageHours, 4);
  assert.ok(insights.months.months.length >= 2);
  assert.ok(insights.normal.status);
});
