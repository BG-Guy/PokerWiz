// The leak report's detail views (src/coach/leakDetails.js): plain data for the sheets, with the buttons that lead
// on (a leak's page, a drill in Practice) pointing at addresses the app understands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAK_VERSION, leakOverview } from '../../src/coach/leaks.js';
import { focusFromParams } from '../../src/coach/spots.js';
import { areaDetail, overallDetail, methodDetail, youVsGtoLine, lossText, bbText, drillLink, entryFor } from '../../src/coach/leakDetails.js';

const row = (over = {}) => ({
  i: 0, area: 'river-vs-bet', street: 'River', position: 'BB', players: 2, potType: 'srp', role: 'caller', ip: false, cls: 'AJo', str: 0.5,
  you: 'call', best: 'fold', gto: [0.7, 0, 0.3, 0], loss: 4, pot: 30, score: 40, ...over,
});
const hand = (id, decisions) => ({ id, streets: [], coachDecisions: { v: LEAK_VERSION, detail: 'fast', decisions } });
const hands = [hand('a', [row(), row({ i: 1, loss: 2, score: 55 }), row({ i: 2, loss: 1, score: 70 })]), hand('b', [row({ area: 'open', street: 'Preflop', position: 'BTN', gto: [0.1, 0, 0, 0.9], you: 'raise', loss: 0, score: 100 })])];

test('what you did against what GTO does, in a line', () => {
  assert.equal(youVsGtoLine(row()), 'You called; GTO folds 70%');
  assert.equal(youVsGtoLine(row({ you: 'fold' })), 'You folded, as GTO mostly does (70%)');
});

test('costs are shown in big blinds', () => {
  assert.equal(lossText(4.25), '−4.3 bb');
  assert.equal(lossText(0), '0 bb');
  assert.equal(bbText(120.4), '120 bb');
});

test('an area detail leads with its cost and ends with where to go', () => {
  const overview = leakOverview(hands);
  const detail = areaDetail(overview.worst);
  assert.equal(detail.title, 'Facing a river bet');
  assert.equal(detail.lead.value, '−7.0 bb');
  assert.equal(detail.lead.tone, 'negative');
  const types = detail.sections.map((s) => s.type);
  assert.deepEqual(types, ['text', 'facts', 'list', 'actions']);
  const [open, drill] = detail.sections.at(-1).items;
  assert.equal(open.to, '/leaks/river-vs-bet');
  assert.deepEqual(focusFromParams(new URLSearchParams(drill.to.split('?')[1])), { area: 'river-vs-bet' });
  // On the leak's own page there is no button to itself.
  assert.equal(areaDetail(overview.worst, { open: false }).sections.at(-1).items.length, 1);
});

test('the overall detail adds up by street and by kind of spot', () => {
  const detail = overallDetail(leakOverview(hands));
  assert.equal(detail.title, 'Your play vs GTO');
  const breakdown = detail.sections.find((s) => s.type === 'breakdown');
  assert.deepEqual(breakdown.groups.map((g) => g.key), ['street', 'spot']);
  assert.deepEqual(breakdown.groups[0].items.map((i) => i.label), ['Preflop', 'River']);
  assert.equal(breakdown.groups[0].items[1].display, '−7.0 bb');
  assert.ok(methodDetail().sections[0].paragraphs.length >= 3);
});

test('a drill link names the area, and narrows to one group when asked', () => {
  assert.deepEqual(focusFromParams(new URLSearchParams(drillLink('flop-vs-bet').split('?')[1])), { area: 'flop-vs-bet' });
  assert.deepEqual(focusFromParams(new URLSearchParams(drillLink('flop-vs-bet', 'position', 'BB').split('?')[1])), { area: 'flop-vs-bet', position: 'BB' });
});

test('an area with no spots yet still has a page; a made-up one does not', () => {
  const areas = leakOverview(hands).areas;
  assert.equal(entryFor(areas, 'river-vs-bet').count, 3);
  assert.equal(entryFor(areas, 'turn-bet').count, 0);
  assert.equal(entryFor(areas, 'nonsense'), null);
});
