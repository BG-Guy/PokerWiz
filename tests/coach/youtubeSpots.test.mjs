// The YouTube hand fixtures (tests/fixtures/hungry-horse): every spot replays into a hand the coach accepts, each
// key decision is a real hero decision, and the saved comparison (results.json) covers every spot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useDiskCharts } from '../gto/helpers.mjs';
import { analyzeHand } from '../../src/coach/analyzeHand.js';
import { buildSpot, decisionIndex } from '../../scripts/youtube/buildSpot.mjs';

useDiskCharts();
const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/hungry-horse/${name}`, import.meta.url), 'utf8'));
const { spots } = fixture('spots.json');
const { hands } = fixture('hands.json');
const PLAYS = new Set(['fold', 'check', 'call', 'bet', 'raise']);

test('every YouTube spot replays into a hand the coach accepts, with and without reads', async () => {
  assert.equal(spots.length, 30);
  for (const spot of spots) {
    for (const reads of [false, true]) {
      const { record, heroDecisions } = buildSpot(spot, { reads });
      const report = await analyzeHand(record, { preflopOnly: true });
      assert.ok(report.decisions.length >= 1, `${spot.id}: the coach sees the hero's preflop decision`);
      for (const key of spot.decisions) {
        const index = decisionIndex(heroDecisions, key);
        assert.ok(index >= 0, `${spot.id}: the hero acts on the ${key.street.toLowerCase()}`);
        assert.ok(PLAYS.has(key.youtube.play), `${spot.id}: the video's play is one of ${[...PLAYS]}`);
      }
      if (reads) for (const position of Object.keys(spot.reads)) assert.ok(record.players.find((p) => p.position === position)?.profile, `${spot.id}: ${position} has a read`);
    }
  }
});

test('each spot points at its hand in the full list, and the saved comparison covers every key decision', () => {
  const byId = new Map(hands.map((h) => [h.id, h]));
  for (const spot of spots) assert.equal(byId.get(spot.source.hand)?.spot, spot.id, `${spot.id} is linked from hands.json`);
  const { results } = fixture('results.json');
  assert.deepEqual(results.map((r) => r.id), spots.map((s) => s.id));
  results.forEach((r, k) => assert.equal(r.decisions.length, spots[k].decisions.length, `${r.id}: one result per key decision`));
});
