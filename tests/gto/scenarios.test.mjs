// Ranges page data: the browsable spots of a solved preflop chart (names, lines, groups, ids that survive a
// change of depth), and what a spot's strategy looks like hand by hand (action shares, EV losses, ranges).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDiskCharts } from './helpers.mjs';
import { loadChart } from '../../src/gto/preflop/charts.js';
import { listScenarios, findScenario, situationsFor, variantsOf, nearestScenario, popularScenarios, seatHeadline, seatOf, rangesPath, KINDS } from '../../src/gto/preflop/scenarios.js';
import { buildGrid, villainRange, describeHand, lossText, handCards, handType, neighborOf, rangeText, actionRangeText, displayOrder } from '../../src/gto/preflop/scenarioGrid.js';
import { CLASS_NAMES } from '../../src/gto/cards.js';
import { PREMIUM_NAMES } from '../../src/gto/preflop/premiums.js';

useDiskCharts();
const cls = (name) => CLASS_NAMES.indexOf(name);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

const chart100 = await loadChart(100, 0);
const list100 = listScenarios(chart100);
const spot = (id, list = list100) => {
  const s = findScenario(list, id);
  assert.ok(s, `spot ${id} exists`);
  return s;
};

test('every seat opens from a first-in spot, and the groups come in picker order', () => {
  const opens = list100.filter((s) => s.kind === 'open');
  assert.deepEqual(opens.map((s) => s.position), ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
  assert.equal(spot('BTN').title, 'BTN open');
  assert.deepEqual(spot('BTN').actions.map((a) => a.label), ['Fold', 'Raise to 2.5']);
  assert.equal(spot('BTN').subtitle, 'Folded to BTN');
  const order = list100.map((s) => KINDS.findIndex((k) => k.id === s.kind));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'spots are grouped in picker order');
  assert.ok(new Set(list100.map((s) => s.id)).size === list100.length, 'ids are unique');
});

test('a spot facing an open is named, sized and labelled like a player would say it', () => {
  const s = spot('BB/BTNr');
  assert.equal(s.title, 'BB vs BTN open');
  assert.equal(s.sizes, 'BTN opens to 2.5 bb');
  assert.deepEqual(s.actions.map((a) => a.label), ['Fold', 'Call 2.5', '3-bet to 9.4']);
  assert.deepEqual(s.actions.map((a) => a.family), ['fold', 'call', 'raise']);
  assert.equal(s.pot, 4); // 2.5 + 0.5 + 1 (the SB folded: its half blind stays)
  assert.equal(s.toCall, 1.5);
  assert.ok(Math.abs(s.potOdds - 1.5 / 5.5) < 1e-9);
  assert.deepEqual(s.focus, { area: 'vs-open', position: 'BB', opener: 'BTN' });
  assert.equal(s.villainPosition, 'BTN');
  assert.equal(s.villainVerb, 'opens');
  assert.equal(s.villainSpot, 'BTN', "the opponent's own decision is the button's open");
  assert.ok(s.weight > 0.05 && s.weight < 0.2, `BB vs BTN open comes up in about one deal in 9 (${s.weight})`);
});

test('callers make variants of the same line of play, the heads-up spot first', () => {
  const squeeze = spot('BB/BTNr-SBc');
  assert.equal(squeeze.title, 'BB vs BTN open + SB call');
  assert.deepEqual(squeeze.callers, ['SB']);
  assert.equal(squeeze.groupId, spot('BB/BTNr').groupId);
  assert.deepEqual(variantsOf(list100, squeeze).map((s) => s.id), ['BB/BTNr', 'BB/BTNr-SBc']);
  const bb = situationsFor(list100, seatOf('BB'));
  const facing = bb.find((k) => k.id === 'vs-open');
  assert.equal(facing.groups[0].base.id, 'BB/BTNr', 'the most common line comes first');
  assert.ok(facing.groups.every((g) => g.base.callers.length === 0 || g.variants.every((v) => v.callers.length >= g.base.callers.length)));
});

test('your open vs a 3-bet, your 3-bet vs a 4-bet and your 4-bet vs an all-in', () => {
  const threeBet = spot('BTN/BTNr-SBr');
  assert.equal(threeBet.title, 'BTN open vs SB 3-bet');
  assert.equal(threeBet.sizes, 'BTN opens to 2.5 bb · SB 3-bets to 9.4 bb');
  assert.deepEqual(threeBet.actions.map((a) => a.label), ['Fold', 'Call 9.4', '4-bet to 21.6']);
  assert.deepEqual(threeBet.focus, { area: 'vs-3bet', position: 'BTN', opener: 'BTN' });
  assert.equal(threeBet.villainVerb, '3-bets');
  assert.equal(threeBet.villainSpot, 'SB/BTNr', 'the 3-bettor chose it facing the button open');

  const fourBet = spot('BB/BTNr-BBr-BTNr');
  assert.equal(fourBet.kind, 'vs-4bet');
  assert.equal(fourBet.title, 'BB 3-bet vs BTN 4-bet');
  assert.deepEqual(fourBet.actions.map((a) => a.family), ['fold', 'call', 'allin']);
  assert.deepEqual(fourBet.focus, { area: 'vs-4bet', position: 'BB', opener: 'BTN' });

  const allIn = list100.find((s) => s.kind === 'vs-allin' && s.id.startsWith('BTN/BTNr-SBr-BTNr'));
  assert.equal(allIn.title, 'BTN 4-bet vs SB all-in');
  assert.deepEqual(allIn.actions.map((a) => a.label), ['Fold', 'Call 100']);
  assert.equal(allIn.focus, null, 'Practice cannot ask for "you 4-bet and they shoved"');
  // Every focus is one Practice's generator can match: an area it knows, your seat, and the first raiser when someone raised.
  for (const s of list100.filter((x) => x.focus)) {
    assert.ok(['open', 'vs-open', 'vs-3bet', 'vs-4bet'].includes(s.focus.area), s.id);
    assert.ok(['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'].includes(s.focus.position), s.id);
    assert.equal(Boolean(s.focus.opener), s.focus.area !== 'open', `${s.id}: an opener whenever someone raised`);
  }
});

test('the small blind limp is the one limped pot, and Practice has nothing to drill there', () => {
  const limp = spot('BB/SBc');
  assert.equal(limp.kind, 'limp');
  assert.equal(limp.title, 'BB vs SB limp');
  assert.deepEqual(limp.actions.map((a) => a.label), ['Check', 'Raise to 3.5']);
  assert.equal(limp.focus, null);
  assert.equal(limp.villainSpot, 'SB', 'the limp was the small blind first in');
  assert.equal(spot('BTN').villainSpot, null);
  assert.equal(spot('SB/SBc-BBr').title, 'SB limp vs BB raise');
  assert.equal(spot('BB/SBc-BBr-SBr').title, 'BB raise vs SB re-raise');
  assert.deepEqual(spot('SB').actions.map((a) => a.label), ['Fold', 'Limp', 'Raise to 3']);
});

test('only solved spots are listed, each with its own stored data', () => {
  for (const s of list100) {
    const data = chart100.dataAt(s.node);
    assert.ok(data?.exact, `${s.id} is stored in the chart`);
    assert.equal(s.actions.length, s.node.actions.length);
    assert.ok(s.weight > 0 && s.weight <= 1 + 1e-9, `${s.id} weight`);
    assert.ok(s.title.length > 3);
  }
  // A heads-up spot that the solution reaches is there; one that isn't stored (a long multiway line) is not.
  const unsolved = chart100.tree.decisions.filter((n) => !chart100.dataAt(n)?.exact).length;
  assert.ok(unsolved > 0 && list100.length < chart100.tree.decisions.length - unsolved);
});

test('the seat list and the popular spots point at real spots', () => {
  assert.ok(Math.abs(seatHeadline(list100, seatOf('BTN')).share - 0.4) < 0.04, 'the button opens about 40%');
  const bb = seatHeadline(list100, seatOf('BB'));
  assert.ok(bb.share > 0.6 && bb.share < 0.78 && bb.label === 'defends vs BTN', 'the big blind defends about 70% vs the button');
  assert.deepEqual(popularScenarios(list100).slice(0, 2).map((s) => s.title), ['BB vs BTN open', 'BTN open']);
  assert.equal(seatOf('UTG1'), 1, 'the URL-safe spelling of UTG+1 is understood');
});

test('other pages can link to a range from the focus Practice and the leak report use', () => {
  assert.equal(rangesPath({ area: 'vs-open', position: 'BB', opener: 'BTN' }, 100), '/ranges?spot=BB%2FBTNr&depth=100');
  assert.equal(rangesPath({ area: 'open', position: 'UTG+1' }), '/ranges?spot=UTG1');
  assert.equal(rangesPath({ area: 'vs-3bet', position: 'BTN', opener: 'BTN' }), null, 'a 3-bet depends on who made it');
  assert.equal(rangesPath({ area: 'flop-bet', position: 'BTN' }), null);
  for (const focus of [{ area: 'open', position: 'CO' }, { area: 'vs-open', position: 'SB', opener: 'UTG+1' }]) {
    const id = new URL(rangesPath(focus), 'http://x').searchParams.get('spot');
    assert.ok(findScenario(list100, id), `${id} is a real spot`);
  }
});

test('a spot is followed from one depth to another', async () => {
  const list20 = listScenarios(await loadChart(20, 0));
  const from = spot('BB/BTNr');
  assert.equal(nearestScenario(list20, from).id, 'BB/BTNr', 'the same spot exists at 20 bb');
  const gone = { id: 'BB/COr-HJa', seat: seatOf('BB'), kind: 'vs-open', opener: 'BTN', villain: seatOf('BTN'), callers: [] };
  assert.equal(nearestScenario(list20, gone).id, 'BB/BTNr', 'else the closest one: same seat, group and opponent');
  assert.equal(nearestScenario(list20, null), null);
});

test('the grid: every class adds up, and so do the totals', () => {
  const grid = buildGrid(chart100, spot('BB/BTNr'));
  assert.equal(grid.cells.length, 169);
  for (const cell of grid.cells) assert.ok(Math.abs(sum(cell.freq) - 1) < 1e-4, `${cell.name} frequencies add up`);
  assert.ok(Math.abs(sum(grid.actions.map((a) => a.share)) - 1) < 1e-6, 'action shares add up to 1');
  assert.ok(Math.abs(grid.range.share - 1) < 1e-9, 'the big blind arrives with every hand');
  const defend = 1 - grid.actions[0].share;
  assert.ok(defend > 0.6 && defend < 0.78, `defends ${defend}`);
  assert.deepEqual(grid.order, [2, 1, 0], 'the 3-bet reads first, the fold last');
  assert.ok(grid.mixed > 0 && grid.mixed < 60);
  assert.ok(grid.exact);
});

test('premiums 3-bet, and their other options cost real money (the coach agrees)', () => {
  const grid = buildGrid(chart100, spot('BB/BTNr'));
  for (const name of PREMIUM_NAMES) {
    const cell = grid.cells[cls(name)];
    assert.ok(cell.freq[2] > 0.95, `${name} 3-bets`);
    assert.equal(cell.loss[2], 0);
    assert.ok(cell.loss[1] >= 0.25 && cell.loss[0] >= 0.25, `${name}: calling and folding cost at least 0.25 bb`);
    assert.equal(describeHand(grid, cls(name)).headline, 'Always 3-bet.');
  }
  assert.ok(grid.cells[cls('72o')].freq[0] > 0.95, '72o folds');
  assert.equal(describeHand(grid, cls('72o')).headline, 'Always fold.');
});

test('a hand you would not be holding here is flagged, and your range shrinks to what got you here', () => {
  const grid = buildGrid(chart100, spot('BTN/BTNr-SBr'));
  assert.ok(grid.range.share > 0.35 && grid.range.share < 0.45, `BTN's range is its open (${grid.range.share})`);
  assert.equal(grid.cells[cls('AA')].inRange, true);
  assert.equal(grid.cells[cls('72o')].inRange, false);
  const out = describeHand(grid, cls('72o'));
  assert.equal(out.tone, 'out');
  assert.match(out.headline, /never get here with 72o/);
  const total = sum(grid.actions.map((a) => a.share));
  assert.ok(Math.abs(total - 1) < 1e-6);
});

test("the opponent's range: how wide the button opens, how often the small blind 3-bets", () => {
  const btn = villainRange(chart100, spot('BB/BTNr'));
  assert.equal(btn.position, 'BTN');
  assert.ok(btn.share > 0.35 && btn.share < 0.45);
  assert.ok(btn.weights[cls('AA')] > 0.99 && btn.weights[cls('72o')] < 0.01);
  const threeBettor = villainRange(chart100, spot('BTN/BTNr-SBr'));
  assert.equal(threeBettor.position, 'SB');
  assert.ok(threeBettor.share > 0.05 && threeBettor.share < 0.2, 'a 3-bet range is narrow');
  assert.equal(villainRange(chart100, spot('BTN')), null, 'nobody acted before an open');
  assert.equal(villainRange(chart100, spot('BB/SBc')).position, 'SB');
});

test('plain-language reading of mixed hands and costs', () => {
  const grid = buildGrid(chart100, spot('SB'));
  const mixed = grid.cells.find((c) => c.mixed);
  const text = describeHand(grid, mixed.cls);
  assert.equal(text.tone, 'mixed');
  assert.match(text.headline, /^Mix: /);
  assert.equal(text.rows.length, 3);
  assert.equal(text.rows[0].action.family, 'raise', 'the biggest bet reads first');
  const aa = describeHand(buildGrid(chart100, spot('BTN')), cls('AA'));
  assert.equal(aa.headline, 'Always raise.');
  assert.match(aa.detail, /^Folding costs \d/);
  assert.equal(lossText(0), '0 bb');
  assert.equal(lossText(0.04), 'under 0.1 bb');
  assert.equal(lossText(0.4), '0.4 bb');
  assert.equal(lossText(14.2), '14 bb');
  assert.equal(lossText(35), 'over 25 bb');
});

test('hands: example cards, kinds, neighbours and range notation', () => {
  assert.deepEqual(handCards(cls('AKs')), ['As', 'Ks']);
  assert.deepEqual(handCards(cls('AKo')), ['As', 'Kh']);
  assert.deepEqual(handCards(cls('77')), ['7s', '7h']);
  assert.deepEqual([handType(cls('AKs')), handType(cls('AKo')), handType(cls('77'))], ['suited', 'offsuit', 'pair']);
  assert.equal(neighborOf(0, -1, 0), null);
  assert.equal(neighborOf(0, 1, 0), 1);
  assert.equal(neighborOf(0, 0, 1), 13);
  assert.equal(neighborOf(168, 1, 0), null);

  const weights = (names) => Float32Array.from({ length: 169 }, (_, c) => (names.includes(CLASS_NAMES[c]) ? 1 : 0));
  assert.equal(rangeText(weights(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AQs', 'AKo'])), 'JJ+, AQs+, AKo');
  assert.equal(rangeText(weights(['88', '77', '66', 'A9s', 'A8s', 'A7s', 'T9s', '98s'])), '88-66, A9s-A7s, T9s, 98s');
  assert.equal(rangeText(weights(CLASS_NAMES.filter((n) => n.length === 2))), '22+');
  const grid = buildGrid(chart100, spot('BTN'));
  assert.match(actionRangeText(grid, 1).always, /^22\+, A2s\+/, 'the button opens every pair and suited ace');
  assert.deepEqual(displayOrder([{ family: 'fold' }, { family: 'call' }, { family: 'raise', to: 5 }, { family: 'allin' }]), [3, 2, 1, 0]);
});

test('every cash depth and an ante chart list their spots, and every grid adds up', async () => {
  for (const [stack, ante] of [[20, 0], [40, 0], [60, 0], [150, 0], [200, 0], [20, 1]]) {
    const chart = await loadChart(stack, ante);
    const list = listScenarios(chart);
    assert.ok(list.length > 300, `${stack} bb has spots`);
    assert.equal(list.filter((s) => s.kind === 'open').length, 7);
    assert.ok(new Set(list.map((s) => s.id)).size === list.length, `${stack} bb ids are unique`);
    for (const s of list.filter((_, i) => i % 40 === 0)) {
      const grid = buildGrid(chart, s);
      assert.ok(Math.abs(sum(grid.actions.map((a) => a.share)) - 1) < 1e-6, `${stack} bb ${s.id} adds up`);
      for (const cell of grid.cells) assert.ok(Math.abs(sum(cell.freq) - 1) < 1e-4);
    }
    const open = buildGrid(chart, findScenario(list, 'BTN'));
    const opens = 1 - open.actions[0].share; // everything but the fold
    assert.ok(opens > 0.2 && opens < 0.6, `${stack} bb: the button opens a fair share (${opens})`);
    assert.ok(Math.abs(opens - findScenario(list, 'BTN').headline.share) < 1e-6, 'the headline is the same number');
  }
});

test('short stacks have all-in options and a 3-bet can already be a shove', async () => {
  const list20 = listScenarios(await loadChart(20, 0));
  assert.deepEqual(spot('BTN', list20).actions.map((a) => a.family), ['fold', 'raise', 'allin']);
  assert.deepEqual(spot('BTN/BTNr-SBa', list20).actions.map((a) => a.label), ['Fold', 'Call 20']);
  assert.equal(spot('BTN/BTNr-SBa', list20).title, 'BTN open vs SB all-in');
});
