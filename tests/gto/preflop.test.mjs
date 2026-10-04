// The preflop side of the GTO engine: the chart file format, the solved charts themselves (premiums, range
// widths by position, every stack depth), and how real hands are mapped onto the 8-max tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDiskCharts } from './helpers.mjs';
import { buildPreflopTree, POSITIONS } from '../../src/gto/preflop/tree.js';
import { encodeChart, decodeChart, encodeLoss, decodeLoss } from '../../src/gto/preflop/chartFormat.js';
import { loadChart } from '../../src/gto/preflop/charts.js';
import { CHART_CONFIGS, chartFor } from '../../src/gto/preflop/configs.js';
import { mapSeats, matchAction } from '../../src/gto/preflop/walker.js';
import { CLASS_NAMES, CLASS_COMBOS } from '../../src/gto/cards.js';

useDiskCharts();
const cls = (name) => CLASS_NAMES.indexOf(name);
const nodeAt = (tree, key) => tree.decisions.find((n) => n.key === key);
const foldsBefore = (seat) => POSITIONS.slice(0, seat).map((x) => `${x}:f`);
// Share of a class taking the raise-type actions (raise or all in) at a node.
const raiseShare = (chart, node, name) => {
  const data = chart.dataAt(node);
  return node.actions.reduce((sum, a, k) => sum + (a.type === 'raise' || a.type === 'allin' ? data.strategy[k * 169 + cls(name)] : 0), 0);
};
// Share of all hands taking raise-type actions at a node (how wide the raising range is).
const raiseWidth = (chart, node) => CLASS_NAMES.reduce((sum, name, c) => sum + (CLASS_COMBOS[c] / 1326) * raiseShare(chart, node, name), 0);

test('chart files round-trip through the binary format', () => {
  const tree = buildPreflopTree(20, 0);
  const nodes = tree.decisions.map((node, id) => {
    if (id % 3) return null;
    const A = node.actions.length;
    const strategy = new Float64Array(A * 169);
    const loss = new Float64Array(A * 169);
    for (let c = 0; c < 169; c++) {
      strategy[(c % A) * 169 + c] = 0.7;
      strategy[((c + 1) % A) * 169 + c] += 0.3;
      for (let a = 0; a < A; a++) loss[a * 169 + c] = a === c % A ? 0 : 0.5 + a;
    }
    return { strategy, loss };
  });
  const decoded = decodeChart(encodeChart({ stack: 20, ante: 0, tree, nodes }), tree);
  assert.equal(decoded.stack, 20);
  decoded.nodes.forEach((node, id) => {
    if (id % 3) return assert.equal(node, null);
    const A = tree.decisions[id].actions.length;
    for (let c = 0; c < 169; c += 17) {
      let total = 0;
      for (let a = 0; a < A; a++) total += node.strategy[a * 169 + c];
      assert.ok(Math.abs(total - 1) < 1e-6, 'frequencies add up to 1');
      assert.ok(A === 1 || node.strategy[(c % A) * 169 + c] >= 0.68);
      assert.equal(node.loss[(c % A) * 169 + c], 0);
    }
  });
  // Losses keep their size to within a level.
  for (const bb of [0, 0.05, 0.5, 2, 10, 50]) assert.ok(Math.abs(decodeLoss(encodeLoss(bb)) - bb) <= Math.max(0.05, bb * 0.45), `loss ${bb}`);
});

test('every stack depth has a chart, picked on a log scale', () => {
  assert.equal(CHART_CONFIGS.length, 14);
  assert.equal(chartFor(87, 0).name, 'cash-100');
  assert.equal(chartFor(33, 0).name, 'cash-30');
  assert.equal(chartFor(36, 0).name, 'cash-40');
  assert.equal(chartFor(250, 0).name, 'cash-200');
  assert.equal(chartFor(18, 1).name, 'ante-20');
  assert.equal(chartFor(5, 1).name, 'ante-10');
});

test('premium hands are raised and re-raised at every depth', async () => {
  for (const config of CHART_CONFIGS) {
    const chart = await loadChart(config.stack, config.ante);
    const { tree } = chart;
    // Opening from every seat up to the button: AA, KK, QQ and AK always come in for a raise.
    for (let seat = 0; seat < 6; seat++) {
      const node = nodeAt(tree, foldsBefore(seat).join('|'));
      for (const hand of ['AA', 'KK', 'QQ', 'AKs', 'AKo']) assert.ok(raiseShare(chart, node, hand) > 0.97, `${config.name}: ${POSITIONS[seat]} opens ${hand}`);
    }
    // Facing a single open (everyone in between folded): AA and KK always re-raise (they're node-locked to, see
    // scripts/gto/preflop/cfr.mjs), and QQ and AK never fold.
    for (const opener of [0, 3, 4, 5]) {
      const open = nodeAt(tree, foldsBefore(opener).join('|'));
      const raise = open.actions.find((a) => a.type === 'raise');
      if (!raise) continue;
      let key = [...foldsBefore(opener), `${POSITIONS[opener]}:r${raise.to}`].join('|');
      for (let seat = opener + 1; seat < 8; seat++) {
        const node = nodeAt(tree, key);
        if (node && chart.dataAt(node)?.exact) {
          const where = `${config.name}: ${POSITIONS[seat]} vs a ${POSITIONS[opener]} open`;
          assert.ok(raiseShare(chart, node, 'AA') > 0.98, `${where} re-raises AA`);
          assert.ok(raiseShare(chart, node, 'KK') > 0.98, `${where} re-raises KK`);
          const fold = node.actions.findIndex((a) => a.type === 'fold');
          for (const hand of ['AA', 'KK', 'QQ', 'AKs']) assert.ok(chart.dataAt(node).strategy[fold * 169 + cls(hand)] < 0.02, `${where} never folds ${hand}`);
        }
        key += `|${POSITIONS[seat]}:f`;
      }
    }
  }
});

test('opening ranges widen from early position to the button (100 bb)', async () => {
  const chart = await loadChart(100, 0);
  const widths = [0, 1, 2, 3, 4, 5].map((seat) => raiseWidth(chart, nodeAt(chart.tree, foldsBefore(seat).join('|'))));
  for (let p = 1; p < widths.length; p++) assert.ok(widths[p] > widths[p - 1], `seat ${p} opens wider than seat ${p - 1}: ${widths.map((w) => Math.round(w * 100))}`);
  assert.ok(widths[0] > 0.08 && widths[0] < 0.22, `UTG opens ${widths[0]}`);
  assert.ok(widths[5] > 0.35 && widths[5] < 0.65, `BTN opens ${widths[5]}`);
  // The worst hand folds under the gun.
  assert.equal(raiseShare(chart, chart.tree.root, '72o'), 0);
});

test('seats map onto the 8-max tree for 6-, 8- and 9-handed tables', () => {
  assert.deepEqual([...mapSeats(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']).values()], [2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...mapSeats(['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']).values()], [0, 1, 2, 3, 4, 5, 6, 7]);
  // 9-handed: the first seat to fold is left out.
  const nine = mapSeats(['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'], new Set(['UTG+1']));
  assert.equal(nine.get('UTG+1'), -1);
  assert.equal(nine.get('UTG'), 0);
  assert.equal(nine.get('MP'), 1);
  assert.equal(nine.get('BB'), 7);
});

test('real actions map to the nearest tree action', () => {
  const tree = buildPreflopTree(100, 0);
  const root = tree.root;
  assert.equal(root.actions[matchAction(root, { type: 'raise', to: 3 }, 100).index].type, 'raise');
  assert.equal(matchAction(root, { type: 'call', to: 1 }, 100).note, 'limp');
  assert.equal(root.actions[matchAction(root, { type: 'fold' }, 100).index].type, 'fold');
  const vsOpen = nodeAt(tree, 'UTG:r2.5');
  assert.equal(vsOpen.actions[matchAction(vsOpen, { type: 'raise', to: 8 }, 100).index].type, 'raise');
  // 100 bb deep there's no shove over an open in the game: a real one maps to the biggest raise.
  assert.equal(vsOpen.actions[matchAction(vsOpen, { type: 'allin', to: 100 }, 100).index].to, 7.5);
  // 30 bb deep there is.
  const short = nodeAt(buildPreflopTree(30, 0), 'UTG:r2.2');
  assert.equal(short.actions[matchAction(short, { type: 'allin', to: 30 }, 30).index].type, 'allin');
});
