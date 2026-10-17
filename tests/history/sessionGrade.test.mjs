// Session grades: decisions from the hands you saved (coach accuracy, else your ratings), results from money won,
// and time played, combined into a letter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeSession } from '../../src/utils/sessionGrade.js';

const cash = (overrides = {}) => ({ format: 'cash', bigBlind: 2, buyIn: 200, cashOut: 200, expenses: 0, durationMin: 240, ...overrides });

test('break-even, 4 hours, no hands: results and time only, and it says so', () => {
  const g = gradeSession(cash());
  assert.deepEqual(g.parts.map((p) => p.key), ['results', 'time']);
  assert.equal(g.parts[0].score, 50);
  assert.equal(g.parts[1].score, 100);
  assert.equal(g.score, 70); // 50 x 0.6 + 100 x 0.4
  assert.equal(g.letter, 'B');
  assert.match(g.note, /results and time only/);
});

test('decisions come from the coach first, then from your ratings', () => {
  const coach = gradeSession(cash(), [{ coachAccuracy: 90 }, { coachAccuracy: 70, rating: 1 }, { rating: 5 }]);
  assert.equal(coach.parts[0].key, 'decisions');
  assert.equal(coach.parts[0].score, 80);
  assert.match(coach.parts[0].detail, /2 reviewed hands/);
  const ratings = gradeSession(cash(), [{ rating: 4 }, { rating: 3 }]);
  assert.equal(ratings.parts[0].score, 70);
  assert.equal(coach.note, null);
});

test('winning more scores higher; a big loss with good decisions still grades fairly', () => {
  const win = gradeSession(cash({ cashOut: 320 })); // +60 bb in 4 h = +15 bb/h
  const lose = gradeSession(cash({ cashOut: 80 }));
  assert.ok(win.parts[0].score > 85 && lose.parts[0].score < 15);
  const unlucky = gradeSession(cash({ cashOut: 0 }), [{ coachAccuracy: 92 }]);
  assert.ok(['B', 'C'].includes(unlucky.letter), `well played but lost: ${unlucky.score}`);
});

test('time: short sessions are a small sample, very long ones risk fatigue', () => {
  const time = (min) => gradeSession(cash({ durationMin: min })).parts.find((p) => p.key === 'time').score;
  assert.ok(time(20) < time(120) && time(120) < time(240));
  assert.equal(time(300), 100);
  assert.ok(time(720) < 80);
});

test('tournaments use the return on the buy-in', () => {
  const g = gradeSession({ format: 'tournament', bigBlind: 0, buyIn: 100, cashOut: 300, expenses: 0, durationMin: 300 });
  assert.match(g.parts[0].detail, /\+200% on the buy-in/);
  assert.ok(g.parts[0].score > 90);
});
