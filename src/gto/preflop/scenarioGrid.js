// What the strategy of one preflop spot looks like, hand class by hand class (the Ranges page grid): how often
// each of the 169 classes takes each action, what each action costs against the best one, the combo-weighted totals
// ("Raise 18.2% · Call 9.1% · Fold 72.7%"), who gets to the spot with what (your range, theirs), and a plain-
// language reading of one hand. The spots themselves (names, lines, ids) are in scenarios.js.
import { CLASS_NAMES, CLASS_COMBOS, CLASS_COUNT, HAND_COUNT, isPairClass, isSuitedClass } from '../cards.js';
import { lockedLosses } from './premiums.js';
import { reachAt } from './scenarios.js';

const N = CLASS_COUNT;


// A hand reaches a spot with less than this share of its combos: you wouldn't be here with it.
const OUT_OF_RANGE = 0.01;
// A class that takes an action at least this often (and one that doesn't take it more than the other way round) is mixing.
const MIXED_FROM = 0.1;
const PURE_FROM = 0.95;

const isRaiseType = (type) => type === 'raise' || type === 'allin';
const percent = (x, digits = 0) => `${(100 * x).toFixed(digits)}%`;

// The order the actions read in: the biggest bet first, then calls and checks, folds last (the order of a
// cell's colour bar and the legend). Returns action indices.
export function displayOrder(actions) {
  const rank = (a) => (a.family === 'allin' ? 0 : a.family === 'raise' ? 1 : a.family === 'fold' ? 3 : 2);
  return actions.map((_, i) => i).sort((x, y) => rank(actions[x]) - rank(actions[y]) || (actions[y].to ?? 0) - (actions[x].to ?? 0));
}

// Everything the grid shows for a spot (scenario from listScenarios). Returns {
//   scenario, actions: [{ ...action, share (of the range that gets here), combos }],
//   cells: [{ cls, name, combos, freq: [per action], loss: [bb worse than the best, per action], reach (0..1: how
//            much of the class gets here), inRange, best (index of the play it takes most), mixed }],
//   range: { share (of all 1326 combos), combos }, mixed (classes that mix plays), order (display order of actions),
//   exact: the chart stores this spot itself
// }
export function buildGrid(chart, scenario) {
  const { node } = scenario;
  const data = chart.dataAt(node);
  const A = node.actions.length;
  const { reach } = reachAt(chart, node);
  const mine = reach[scenario.seat];
  const raiseAt = node.actions.map((a, k) => (isRaiseType(a.type) ? k : -1)).filter((k) => k >= 0);

  const cells = Array.from({ length: N }, (_, cls) => {
    const freq = Array.from({ length: A }, (_, a) => data.strategy[a * N + cls]);
    // The premiums only re-raise a single raise and the middle pairs only flat it (premiums.js): the cost shown agrees.
    const loss = lockedLosses(node, cls, Array.from({ length: A }, (_, a) => data.loss[a * N + cls]));
    const inRange = mine[cls] >= OUT_OF_RANGE;
    const mixed = inRange && freq.filter((f) => f >= MIXED_FROM).length >= 2;
    return { cls, name: CLASS_NAMES[cls], combos: CLASS_COMBOS[cls], freq, loss, reach: mine[cls], inRange, best: freq.indexOf(Math.max(...freq)), mixed };
  });

  // Totals over the range that gets here: every class counts as many combos as it has, times how much of it arrives.
  const taken = new Array(A).fill(0);
  let total = 0;
  for (const cell of cells) {
    const weight = cell.combos * cell.reach;
    total += weight;
    cell.freq.forEach((f, a) => (taken[a] += weight * f));
  }
  const actions = scenario.actions.map((action, a) => ({ ...action, combos: taken[a], share: total > 0 ? taken[a] / total : 0 }));
  return {
    scenario,
    actions,
    cells,
    range: { combos: total, share: total / HAND_COUNT },
    mixed: cells.filter((c) => c.mixed).length,
    order: displayOrder(actions),
    exact: data.exact,
  };
}

// The range of the opponent whose bet you face (the last raiser; the limper in a limped pot): per class how much of
// it gets to the spot. { seat, position, weights: Float32Array(169), combos, share (of all combos) }, or null when
// nobody has acted (you open).
export function villainRange(chart, scenario) {
  if (scenario.villain === null) return null;
  const weights = reachAt(chart, scenario.node).reach[scenario.villain];
  let combos = 0;
  for (let c = 0; c < N; c++) combos += CLASS_COMBOS[c] * weights[c];
  return { seat: scenario.villain, position: scenario.villainPosition, weights, combos, share: combos / HAND_COUNT };
}

// A range (class weights 0..1) as a one-action grid, so the same grid component can draw it: every class is a cell
// that "plays" with its weight, and classes with (almost) no weight are hollow. name: what the one action is called.
export function weightsGrid(scenario, weights, name = 'In range') {
  const action = { index: 0, type: 'range', family: 'range', label: name, short: name, verb: name.toLowerCase(), gerund: name.toLowerCase() };
  const cells = Array.from({ length: N }, (_, cls) => ({
    cls,
    name: CLASS_NAMES[cls],
    combos: CLASS_COMBOS[cls],
    freq: [weights[cls]],
    loss: [0],
    reach: 1,
    inRange: weights[cls] >= OUT_OF_RANGE,
    best: 0,
    mixed: false,
  }));
  let combos = 0;
  for (const cell of cells) combos += cell.combos * weights[cell.cls];
  return { scenario, actions: [{ ...action, combos, share: combos / HAND_COUNT }], cells, range: { combos, share: combos / HAND_COUNT }, mixed: 0, order: [0], exact: true };
}

// A cost in big blinds in words. The chart keeps losses in coarse steps, so small ones read as "under 0.1 bb".
export function lossText(loss) {
  if (loss < 0.02) return '0 bb';
  if (loss < 0.1) return 'under 0.1 bb';
  if (loss >= 25) return 'over 25 bb';
  return `${loss < 10 ? Number(loss.toFixed(1)) : Math.round(loss)} bb`;
}

const capital = (text) => text[0].toUpperCase() + text.slice(1);

// What to say about one hand in this spot: { tone, headline, detail, rows }.
//   headline  "Always 3-bet." / "Mostly call, sometimes 3-bet." / "You'd fold this earlier."
//   detail    what the other options cost, or how close the choice is
//   rows      one per action, best first: { action, freq, loss, best, text } ("Call is 0.4 bb worse")
//   tone      'raise' | 'call' | 'fold' | 'mixed' | 'out': what the hand mostly does
export function describeHand(grid, cls) {
  const cell = grid.cells[cls];
  const { actions } = grid;
  const rows = grid.order.map((a) => {
    const best = cell.loss[a] < 0.02;
    return {
      action: actions[a],
      freq: cell.freq[a],
      loss: cell.loss[a],
      best,
      text: best ? 'Best play' : `${actions[a].short} is ${lossText(cell.loss[a])} worse`,
    };
  });
  if (!cell.inRange) {
    const never = cell.reach < 0.001;
    return {
      tone: 'out',
      headline: never ? `You'd never get here with ${cell.name}.` : `You almost never get here with ${cell.name}.`,
      detail: `${cell.name} is folded earlier in this line of play, so the chart doesn't tell you what to do with it here.`,
      rows,
    };
  }

  const played = cell.freq.map((f, a) => ({ a, f })).filter(({ f }) => f >= 0.05).sort((x, y) => y.f - x.f);
  const top = played[0];
  const topAction = actions[top.a];
  const tone = top.f >= PURE_FROM || played.length < 2 ? (topAction.family === 'allin' ? 'raise' : topAction.family === 'check' ? 'call' : topAction.family) : 'mixed';
  // What the plays GTO never makes cost.
  const unplayed = cell.freq.map((f, a) => ({ a, loss: cell.loss[a], f })).filter(({ f, loss }) => f < 0.02 && loss >= 0.05).sort((x, y) => x.loss - y.loss);
  const costs = unplayed.map(({ a, loss }) => `${actions[a].gerund} costs ${lossText(loss)}`);
  const costText = costs.length ? `${capital(costs.join(', '))}.` : '';

  if (top.f >= PURE_FROM) {
    const close = !unplayed.length ? "It's close: the other options are within 0.1 bb." : '';
    return { tone, headline: `Always ${topAction.verb}.`, detail: costText || close, rows };
  }
  if (played.length === 1) return { tone, headline: `Mostly ${topAction.verb}.`, detail: costText, rows };
  const parts = played.map(({ a, f }) => `${actions[a].verb} ${percent(f)}`);
  const worst = Math.max(...played.map(({ a }) => cell.loss[a]));
  const equal = worst < 0.1 ? 'The options are about equally good, so either is fine.' : '';
  return { tone, headline: `Mix: ${parts.join(', ')}.`, detail: [equal, costText].filter(Boolean).join(' '), rows };
}

// Two example cards for a class ("AKs" -> As Ks, "AKo" -> As Kh, "77" -> As Ah style pair): for drawing the hand.
export function handCards(cls) {
  const name = CLASS_NAMES[cls];
  if (isPairClass(cls)) return [`${name[0]}s`, `${name[1]}h`];
  return isSuitedClass(cls) ? [`${name[0]}s`, `${name[1]}s`] : [`${name[0]}s`, `${name[1]}h`];
}

// "pair", "suited" or "offsuit".
export const handType = (cls) => (isPairClass(cls) ? 'pair' : isSuitedClass(cls) ? 'suited' : 'offsuit');

// The class next to this one on the grid (dx, dy in cells), or null at the edge.
export function neighborOf(cls, dx, dy) {
  const x = (cls % 13) + dx;
  const y = Math.floor(cls / 13) + dy;
  return x < 0 || x > 12 || y < 0 || y > 12 ? null : y * 13 + x;
}

// ----- Range notation ("22+, A2s+, KTs+, ATo+") -----

const RANKS = 'AKQJT98765432';

// Classes (with a weight each) -> the usual short notation: runs of pairs, and of suited or offsuit hands with the
// same high card, joined with "+" when the run reaches the top ("A5s+" is A5s to AKs) and "-" otherwise.
// weights: Float32Array(169) in 0..1; a class counts when its weight is at least `from`.
export function rangeText(weights, from = 0.5) {
  const parts = [];
  const rankIndex = (ch) => RANKS.indexOf(ch);
  const has = (name) => weights[CLASS_NAMES.indexOf(name)] >= from;
  const describeRun = (names, topEdge) => {
    // names, strongest first, all consecutive on the grid.
    const first = names[0];
    const last = names[names.length - 1];
    if (names.length === 1) return first;
    return topEdge ? `${last}+` : `${first}-${last}`;
  };
  // Pairs.
  let run = [];
  const flushPairs = () => {
    if (run.length) parts.push(describeRun(run, run[0] === 'AA'));
    run = [];
  };
  for (const r of RANKS) {
    if (has(r + r)) run.push(r + r);
    else flushPairs();
  }
  flushPairs();
  // Suited then offsuit, by high card.
  for (const suffix of ['s', 'o']) {
    for (let h = 0; h < RANKS.length - 1; h++) {
      let kickers = [];
      const flush = () => {
        if (kickers.length) {
          const names = kickers.map((k) => RANKS[h] + RANKS[k] + suffix);
          parts.push(describeRun(names, kickers[0] === h + 1));
        }
        kickers = [];
      };
      for (let k = h + 1; k < RANKS.length; k++) {
        if (has(RANKS[h] + RANKS[k] + suffix)) kickers.push(k);
        else flush();
      }
      flush();
    }
  }
  return parts.join(', ');
}

// The range of one action of a spot in notation (hands that take it at least half the time, hands that mix
// it separately). { always: "22+, A2s+", sometimes: "KQo" }.
export function actionRangeText(grid, actionIndex) {
  const weights = Float32Array.from(grid.cells, (cell) => (cell.inRange ? cell.freq[actionIndex] : 0));
  const sometimes = Float32Array.from(weights, (w) => (w >= 0.1 && w < 0.5 ? 1 : 0));
  return { always: rangeText(weights, 0.5), sometimes: rangeText(sometimes, 1) };
}
