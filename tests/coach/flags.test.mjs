// Flagged decisions (utils/flags.js): a flag keeps the whole hand, flagging the same decision twice is one flag,
// notes and removal work, and an exported file replays through scripts/reviewFlags.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { useDiskCharts, playHand } from '../gto/helpers.mjs';
import { analyzeHand } from '../../src/coach/analyzeHand.js';

// The phone's storage, in memory.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const { addFlag, readFlags, removeFlag, setFlagNote, subscribeFlags } = await import('../../src/utils/flags.js');
useDiskCharts();

test('a flagged decision keeps the hand, once, with its note, and replays from an exported file', async () => {
  const { record } = playHand({
    hero: { position: 'BTN', cards: ['Qh', 'Qd'] },
    board: ['5c', '8c', 'Jh'],
    actions: [['UTG', 'fold'], ['UTG+1', 'fold'], ['LJ', 'fold'], ['HJ', 'fold'], ['CO', 'fold'], ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'call'], ['BB', 'check'], ['BTN', 'check']],
  });
  const report = await analyzeHand(record, { detail: 'fast' });
  assert.deepEqual(report.record, record, 'the report carries the hand it reviewed');
  const decision = report.decisions.at(-1);

  let heard = 0;
  const stop = subscribeFlags(() => heard++);
  assert.equal(addFlag({ source: 'review', record: report.record, detail: 'fast', decision }), true);
  addFlag({ source: 'review', record: report.record, detail: 'fast', decision });
  assert.equal(readFlags().length, 1, 'flagging the same decision twice keeps one flag');
  const [flag] = readFlags();
  assert.equal(flag.decision.street, 'Flop');
  assert.equal(flag.decision.you, decision.actual.label);
  setFlagNote(flag.id, 'QQ should bet here');
  assert.equal(readFlags()[0].note, 'QQ should bet here');
  assert.ok(heard >= 3, 'open screens hear about every change');

  // The exported file replays through the review script.
  const dir = mkdtempSync(join(tmpdir(), 'pokerwiz-flags-'));
  const file = join(dir, 'flags.json');
  writeFileSync(file, JSON.stringify({ kind: 'pokerwiz-flags', version: 1, exportedAt: new Date().toISOString(), appVersion: 'test', flags: readFlags() }));
  const output = execFileSync(process.execPath, [new URL('../../scripts/reviewFlags.mjs', import.meta.url).pathname, file], { encoding: 'utf8' });
  assert.match(output, /Note: "QQ should bet here"/);
  assert.match(output, /Now: Flop/);

  removeFlag(flag.id);
  assert.equal(readFlags().length, 0);
  stop();
});
