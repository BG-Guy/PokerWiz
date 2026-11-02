// Letter grades: the one A-F scale for every 0-100 score the app shows (coach accuracy, decisions, sessions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETTERS, letterGrade, letterOf } from '../../src/utils/letterGrade.js';
import { gradeSession } from '../../src/utils/sessionGrade.js';

test('thresholds: A from 85, B from 70, C from 55, D from 40, F below', () => {
  const cases = [
    [100, 'A'], [85, 'A'], [84, 'B'], [70, 'B'], [69, 'C'], [55, 'C'], [54, 'D'], [40, 'D'], [39, 'F'], [0, 'F'],
  ];
  for (const [score, letter] of cases) assert.equal(letterGrade(score).letter, letter, `${score} -> ${letter}`);
  assert.deepEqual(LETTERS.map(([min]) => min), [85, 70, 55, 40, 0]);
});

test('each letter has a word and a color tone', () => {
  assert.deepEqual(letterGrade(92), { letter: 'A', label: 'Excellent', tone: 'good' });
  assert.equal(letterGrade(75).tone, 'good');
  assert.equal(letterGrade(60).tone, 'neutral');
  assert.equal(letterGrade(45).tone, 'warning');
  assert.deepEqual(letterGrade(10), { letter: 'F', label: 'Poor', tone: 'bad' });
});

test('in-between and out-of-range scores still get a letter', () => {
  assert.equal(letterGrade(84.6).letter, 'A'); // rounds like the number the app used to show
  assert.equal(letterGrade(84.4).letter, 'B');
  assert.equal(letterGrade(-5).letter, 'F');
  assert.equal(letterGrade(130).letter, 'A');
});

test('no score, no letter', () => {
  assert.equal(letterGrade(null), null);
  assert.equal(letterGrade(undefined), null);
  assert.equal(letterGrade(Number.NaN), null);
  assert.equal(letterOf(null), '–');
  assert.equal(letterOf(71), 'B');
});

test('session grades use the same scale', () => {
  const g = gradeSession({ format: 'cash', bigBlind: 2, buyIn: 200, cashOut: 200, expenses: 0, durationMin: 240 });
  assert.equal(g.letter, letterGrade(g.score).letter);
  assert.equal(g.label, letterGrade(g.score).label);
});
