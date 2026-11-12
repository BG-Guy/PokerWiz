// Hand strength on a board (src/coach/boardStrength.js): what counts as a draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStrengths } from '../../src/coach/boardStrength.js';
import { comboIndex } from '../../src/coach/combos.js';
import { codeToIndex } from '../../src/utils/cards.js';

const combo = (a, b) => comboIndex(codeToIndex(a), codeToIndex(b));

test("a straight the next card would put on the board is everyone's, not a draw of one hand", () => {
  // 9-8-7-6: any ten or five makes a straight on the board for whoever is still in.
  const { draw } = computeStrengths(['9h', '8c', '7s', '6c'].map(codeToIndex));
  assert.ok(draw[combo('Ad', 'Qh')] < 0.1, `ace-queen has no draw (${draw[combo('Ad', 'Qh')]})`);
  assert.ok(draw[combo('Kd', 'Kh')] < 0.1, `nor have kings (${draw[combo('Kd', 'Kh')]})`);
  // A flush draw is still one, and so is a set drawing to a full house.
  assert.ok(draw[combo('Ac', 'Qc')] >= 0.15, `the flush draw (${draw[combo('Ac', 'Qc')]})`);
  assert.ok(draw[combo('7d', '7h')] >= 0.15, `the set (${draw[combo('7d', '7h')]})`);
});

test('real draws on a plain board are counted as before', () => {
  const { draw } = computeStrengths(['Kh', '8h', '3c'].map(codeToIndex));
  assert.ok(draw[combo('Ah', '5h')] > 0.3, 'the nut flush draw');
  assert.ok(draw[combo('Qd', 'Jc')] < 0.3, 'two overcards and a gutshot are less');
  assert.equal(draw[combo('Kd', 'Ks')] > 0, true, 'a set can still fill up');
});
