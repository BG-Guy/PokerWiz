// The leak report's numbers (src/coach/leaks.js): decisions packed onto a hand, added up by kind of spot, and
// read for which way you lean compared with GTO.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDiskCharts, playHand } from '../gto/helpers.mjs';
import { analyzeHand } from '../../src/coach/analyzeHand.js';
import { areaById } from '../../src/coach/spots.js';
import {
  LEAK_VERSION, packDecisions, collectRows, summarize, tendencyOf, leanSentence, adviceFor, areaSummaries, leakOverview, splitRows, splitsFor,
  rowIsIn, worstRows, focusFor, scanStage, isAnalyzed, skippedMarker, confidence,
} from '../../src/coach/leaks.js';

useDiskCharts();

// A stored decision, with the fields that matter for adding up.
const row = (over = {}) => ({
  i: 0, area: 'flop-vs-bet', street: 'Flop', position: 'BB', players: 2, potType: 'srp', role: 'caller', ip: false, cls: 'AJo', str: 0.5,
  you: 'fold', best: 'call', gto: [0.4, 0, 0.5, 0.1], loss: 1, pot: 12, score: 60, handId: 'h1', ...over,
});

test('a hand analyzed preflop only has just its preflop decisions, packed small', async () => {
  const { record } = playHand({
    hero: { position: 'BTN', cards: ['Qh', 'Qd'] },
    board: ['5c', '8c', 'Jh'],
    actions: [['UTG', 'fold'], ['UTG+1', 'fold'], ['LJ', 'fold'], ['HJ', 'fold'], ['CO', 'fold'], ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'call'], ['BB', 'check'], ['BTN', 'bet', 3.5], ['BB', 'fold']],
  });
  const quick = await analyzeHand(record, { detail: 'fast', preflopOnly: true });
  assert.deepEqual(quick.decisions.map((d) => d.street), ['Preflop']);
  assert.equal(quick.decisions[0].spot.area, 'open');

  const full = await analyzeHand(record, { detail: 'fast' });
  assert.deepEqual(full.decisions.map((d) => d.street), ['Preflop', 'Flop']);
  const packed = packDecisions(full, 'fast');
  assert.equal(packed.v, LEAK_VERSION);
  assert.deepEqual(packed.decisions.map((d) => d.area), ['open', 'flop-bet']);
  const [open, flop] = packed.decisions;
  assert.equal(open.cls, 'QQ');
  assert.equal(open.you, 'raise');
  assert.ok(Math.abs(open.gto.reduce((a, b) => a + b, 0) - 1) < 0.05, 'GTO frequencies add up to one');
  assert.equal(flop.role, 'aggressor');
  assert.equal(flop.ip, true);
  assert.ok(flop.str > 0.5, 'QQ on 5-8-J is a strong hand');
  assert.ok(JSON.stringify(packed).length < 1200, 'small enough to keep on every hand');
  assert.deepEqual(JSON.parse(JSON.stringify(packed)), packed, 'plain data');
});

test('adding up: cost, grade, and how you play against how GTO plays', () => {
  const rows = [
    row({ you: 'fold', loss: 2, score: 40 }),
    row({ you: 'fold', loss: 1, score: 70 }),
    row({ you: 'call', loss: 0, score: 100 }),
  ];
  const s = summarize(rows);
  assert.equal(s.count, 3);
  assert.equal(s.cost, 3);
  assert.equal(s.mistakes, 1, 'a D or F is a mistake');
  assert.ok(Math.abs(s.you.fold - 2 / 3) < 1e-9);
  assert.ok(Math.abs(s.gto.fold - 0.4) < 1e-9);
  assert.equal(s.grade.letter, 'B');
  assert.equal(confidence(3), 'early');
  assert.equal(confidence(8), 'growing');
  assert.equal(confidence(30), 'solid');
  assert.equal(summarize([]).avgScore, null);
});

test('the lean: over-folding is named, a small sample or a small gap is not', () => {
  const area = areaById('flop-vs-bet');
  const folder = summarize(Array.from({ length: 8 }, (_, k) => row({ you: k < 6 ? 'fold' : 'call' })));
  const lean = tendencyOf(folder, area);
  assert.equal(lean.kind, 'fold');
  assert.equal(lean.lean, 'over');
  assert.match(leanSentence(folder, area), /You fold 75% of these; GTO folds 40% of the time/);
  assert.match(adviceFor(folder, area), /give up too easily/);

  assert.equal(tendencyOf(summarize([row(), row()]), area), null, 'two spots is not a lean');
  assert.match(leanSentence(summarize([row(), row()]), area), /Only 2 spots so far/);
  assert.equal(leanSentence(summarize([row(), row()]), area, { counted: true }), 'An early read, not a verdict.');
  const even = summarize(Array.from({ length: 10 }, (_, k) => row({ you: k < 4 ? 'fold' : k < 9 ? 'call' : 'raise' })));
  assert.equal(tendencyOf(even, area), null, 'about what GTO does');
  assert.match(leanSentence(even, area), /No clear lean/);

  // Where nothing is to call the choice is check or bet, and a raise is called a bet.
  const passive = summarize(Array.from({ length: 8 }, () => row({ area: 'flop-bet', you: 'check', gto: [0, 0.3, 0, 0.7] })));
  const betArea = areaById('flop-bet');
  assert.equal(tendencyOf(passive, betArea).kind, 'check');
  assert.match(leanSentence(passive, betArea), /You check 100% of these; GTO checks 30%/);
  const timid = summarize(Array.from({ length: 8 }, (_, k) => row({ area: 'flop-bet', you: k < 7 ? 'check' : 'raise', gto: [0, 0.1, 0, 0.9] })));
  assert.match(leanSentence(timid, betArea), /You check 88% of these; GTO checks 10%/);
  const opener = summarize(Array.from({ length: 6 }, () => row({ area: 'open', you: 'fold', gto: [0.1, 0, 0, 0.9] })));
  assert.match(adviceFor(opener, areaById('open')), /Open more/);
});

test('areas are ranked by what they cost, and the worst one needs a few spots', () => {
  const hands = [
    { id: 'a', streets: [], coachDecisions: { v: LEAK_VERSION, detail: 'fast', decisions: [row({ area: 'river-vs-bet', loss: 5 }), row({ area: 'river-vs-bet', loss: 4 }), row({ area: 'river-vs-bet', loss: 3 }), row({ area: 'open', loss: 9 })] } },
    { id: 'b', streets: [], coachDecisions: { v: LEAK_VERSION - 1, detail: 'fast', decisions: [row({ loss: 100 })] } },
    { id: 'c', streets: [] },
  ];
  assert.equal(collectRows(hands).length, 4, 'an older version, or none, is left out');
  const overview = leakOverview(hands);
  assert.deepEqual(overview.areas.map((a) => a.area.id), ['river-vs-bet', 'open']);
  assert.equal(overview.worst.area.id, 'river-vs-bet', 'one expensive spot is not yet a leak');
  assert.equal(overview.handsAnalyzed, 1);
  assert.equal(overview.handsTotal, 3);
  assert.equal(areaSummaries([]).length, 0);
});

test('splitting an area, narrowing to a group, and what to drill', () => {
  const rows = [
    row({ position: 'BB', loss: 3, str: 0.5 }),
    row({ position: 'BB', loss: 2, str: 0.1 }),
    row({ position: 'CO', loss: 1, ip: true, str: 0.95 }),
  ];
  const byPosition = splitRows(rows, 'position');
  assert.deepEqual(byPosition.map((g) => [g.key, g.count, g.cost]), [['BB', 2, 5], ['CO', 1, 1]]);
  assert.deepEqual(splitRows(rows, 'strength').map((g) => g.key).sort(), ['Air', 'Medium', 'Nutted']);
  assert.deepEqual(splitRows(rows, 'ip').map((g) => g.label), ['Out of position', 'In position']);
  assert.equal(rows.filter((r) => rowIsIn(r, 'position', 'BB')).length, 2);
  assert.equal(worstRows(rows, 1)[0].loss, 3);

  assert.deepEqual(splitsFor(areaById('vs-open')).map((s) => s.id), ['position', 'family', 'opener']);
  assert.deepEqual(splitsFor(areaById('turn-vs-bet')).map((s) => s.id), ['position', 'strength', 'pot', 'ip', 'role']);
  assert.deepEqual(focusFor('flop-vs-bet'), { area: 'flop-vs-bet' });
  assert.deepEqual(focusFor('flop-vs-bet', 'position', 'BB'), { area: 'flop-vs-bet', position: 'BB' });
  assert.deepEqual(focusFor('flop-vs-bet', 'ip', 'oop'), { area: 'flop-vs-bet', ip: false });
});

test('the scan knows what each hand still needs', () => {
  const postflop = { streets: [{ actions: [{ actor: 'Hero' }] }, { actions: [{ actor: 'Hero' }] }] };
  const preflopOnly = { streets: [{ actions: [{ actor: 'Hero' }] }] };
  assert.equal(scanStage(postflop), 'preflop', 'a quick preflop look first');
  assert.equal(scanStage(preflopOnly), 'fast', 'nothing after the flop: one pass is the whole hand');
  assert.equal(scanStage({ ...postflop, coachDecisions: { v: LEAK_VERSION, detail: 'preflop', decisions: [] } }), 'fast');
  assert.equal(scanStage({ ...postflop, coachDecisions: { v: LEAK_VERSION, detail: 'fast', decisions: [] } }), null);
  assert.equal(scanStage({ ...postflop, coachDecisions: { v: LEAK_VERSION, detail: 'full', decisions: [] } }), null);
  assert.equal(scanStage({ ...postflop, coachDecisions: { v: LEAK_VERSION - 1, detail: 'full', decisions: [] } }), 'preflop', 'an older analysis is redone');
  assert.equal(isAnalyzed({ coachDecisions: skippedMarker('no cards') }), false);
});
