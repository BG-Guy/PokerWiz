// Equity realization measured with TexasSolver, to calibrate the preflop solver's flop model
// (scripts/gto/preflop/payoffs.mjs). The preflop solver values "see a flop" as raw equity plus a transfer
// (position, playability, strength); here a sample of flops is solved for real and every starting hand's
// actual share of the pot is compared with what the model says.
//
// The ranges come from a set of preflop charts, with every hand added at a small "probe" weight: a hand's
// measured value is then what it would earn if it were played this way, even when the chart never does
// (without probes, a chart that never flats 77 from the big blind can't learn that flatting 77 is good, and
// fitting to its own ranges keeps it wrong). Charts -> measure -> fit -> re-solve charts is repeated until
// the charts settle, pooling the measurements of every round.
//   measure:  node scripts/gto-reference/realization.mjs --charts <dir> --tag r1 [--lines srp_btn_bb,3bp_co_btn] [--flops 20] [--probe 0.03] [--accuracy 2.5] [--max-iterations 200] [--seed 11]
//            (give each round its own --seed: pooled rounds then average over different flops)
//   fit:      node scripts/gto-reference/realization.mjs --fit r0,r1 [--play features|free] [--ridge 2] [--out model.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cpus } from 'node:os';
import { flopStart, toTexasRange, useCharts } from './ranges.mjs';
import { solveTexasAsync, WORK } from './texas.mjs';
import { createPayoffs, playability, classRanks, sprWeight, DEFAULT_MODEL } from '../gto/preflop/payoffs.mjs';
import { isPairClass, isSuitedClass } from '../../src/gto/cards.js';
import { cardCode, cardId, classOfCards, CLASS_NAMES, CLASS_COMBOS } from '../../src/gto/cards.js';
import { createRandom } from '../../src/coach/random.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const N = 169;
const dataFile = (tag) => join(WORK, `realization-data-${tag}.json`);
const table = JSON.parse(readFileSync(new URL('../gto/data/equity.json', import.meta.url), 'utf8'));

// A cheap but complete game: every street played, one bet size each, a real raise on the flop (check-raises
// are the out-of-position player's main weapon), all in as the raise and overbet on the turn and river.
// Realization barely depends on the sizes; it needs every runout, every street, and raises. (A flop all in is
// left out: it's many pots and never played, and with every hand probed the tree has to fit in memory.)
const CAL_TREE = {
  flop: { oop: { bet: [50], raise: [60] }, ip: { bet: [50], raise: [60] } },
  turn: { oop: { bet: [66], allin: true }, ip: { bet: [66], allin: true } },
  river: { oop: { bet: [75], allin: true }, ip: { bet: [75], allin: true } },
};

// ----- Flops: a stratified, rank-balanced sample -----
// Strata (suits x pairing x high card) get picks in proportion to how many flops they hold, and each flop is
// weighted by the share it stands for. Within that, each pick is the candidate whose ranks have been used least
// so far: left to chance, 20 flops easily put one rank on half of them (once a 4 was on 10 of 20), and every
// hand holding that rank then looks like it plays great.
export function sampleFlops(count, seed = 11) {
  const strata = new Map();
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      for (let c = b + 1; c < 52; c++) {
        const suits = new Set([a & 3, b & 3, c & 3]).size;
        const ranks = [a >> 2, b >> 2, c >> 2];
        const paired = new Set(ranks).size < 3;
        const high = Math.max(...ranks);
        const tier = high === 12 ? 'A' : high >= 10 ? 'KQ' : high >= 7 ? 'J9' : 'low';
        const key = `${suits}|${paired}|${tier}`;
        if (!strata.has(key)) strata.set(key, []);
        strata.get(key).push([a, b, c]);
      }
    }
  }
  const total = 22100;
  const groups = [...strata.entries()].map(([key, flops]) => ({ key, flops, quota: (count * flops.length) / total }));
  groups.forEach((g) => (g.picks = Math.floor(g.quota)));
  let left = count - groups.reduce((s, g) => s + g.picks, 0);
  for (const g of [...groups].sort((x, y) => (y.quota % 1) - (x.quota % 1))) {
    if (left-- <= 0) break;
    g.picks++;
  }
  const random = createRandom(seed);
  const load = new Float64Array(13); // weighted uses of each rank so far
  const out = [];
  // Heaviest picks first: they move the balance most.
  const picks = groups.flatMap((g) => Array.from({ length: g.picks }, () => ({ g, weight: g.flops.length / total / g.picks }))).sort((x, y) => y.weight - x.weight);
  for (const { g, weight } of picks) {
    let best = null;
    let bestScore = Infinity;
    for (let t = 0; t < 300; t++) {
      const flop = g.flops[Math.floor(random() * g.flops.length)];
      const score = flop.reduce((s, card) => s + load[card >> 2], 0);
      if (score < bestScore) [best, bestScore] = [flop, score];
    }
    for (const card of best) load[card >> 2] += weight;
    out.push({ cards: best.map(cardCode), weight });
  }
  return out;
}

// ----- Measure one preflop line: each class's share of the pot for both players -----
// TexasSolver's values are net chips with the starting pot split evenly between the two players, so a
// hand's share of the pot is (value + pot / 2) / pot.
async function measure(lineId, { flops: count, probe, parallel, accuracy, maxIterations, seed }) {
  const start = await flopStart(lineId);
  const withProbe = (classes) => classes.map((w) => Math.max(w, probe));
  const ranges = { oop: withProbe(start.oop), ip: withProbe(start.ip) };
  const flops = sampleFlops(count, seed);
  const threads = Math.max(1, Math.floor(cpus().length / parallel));
  const specOf = (f) => ({ board: f.cards, pot: start.pot, stack: start.stack, oopRange: toTexasRange(ranges.oop), ipRange: toTexasRange(ranges.ip), tree: CAL_TREE, accuracy, maxIterations, threads });
  const queue = [...flops];
  let solved = 0;
  const began = Date.now();
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      f.base = await solveTexasAsync(specOf(f), { label: `cal-${lineId}-${f.cards.join('')}` });
      solved++;
      console.log(`${lineId}: solved ${solved}/${flops.length} (${Math.round((Date.now() - began) / 1000)} s)`);
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));

  const players = [
    { name: 'oop', ts: '1', seat: 0, chart: start.oop, classes: ranges.oop },
    { name: 'ip', ts: '0', seat: 1, chart: start.ip, classes: ranges.ip },
  ];
  for (const p of players) {
    const sum = new Float64Array(N);
    const weight = new Float64Array(N);
    for (const f of flops) {
      const root = JSON.parse(readFileSync(`${f.base}.json`, 'utf8'));
      if (!root.root_evs) throw new Error(`${f.base}.json has no root values: rebuild TexasSolver with the patch`);
      for (const [combo, ev] of Object.entries(root.root_evs[p.ts])) {
        const cls = classOfCards(cardId(combo.slice(0, 2)), cardId(combo.slice(2, 4)));
        sum[cls] += f.weight * ((ev + start.pot / 2) / start.pot);
        weight[cls] += f.weight;
      }
    }
    p.share = Array.from(sum, (s, c) => (weight[c] > 0 ? s / weight[c] : null));
  }
  return { lineId, pot: start.pot, stack: start.stack, spr: start.stack / start.pot, players: players.map(({ ts, ...p }) => p) };
}

// ----- Hand features playability is fitted on (the default, --play features) -----
// A handful of numbers per hand instead of a free value for each of the 169: with a few dozen flops, whether one
// particular hand connects comes down to a few flops (three of 16 hit 75 once), and a free value per hand
// learns those accidents. A dozen features can't, but still learn the real patterns (big pairs realize far above
// their equity, offsuit aces play badly, suited connectors well).
const FEATURES = [
  ['pair', (high, low, pair) => pair],
  ['pair rank', (high, low, pair) => (pair * high) / 12],
  ['big pair (JJ+)', (high, low, pair) => (pair * Math.max(0, high - 8)) / 4],
  ['suited', (high, low, pair, suited) => suited],
  ['connected', (high, low, pair) => (pair ? 0 : Math.max(0, 3 - (high - low - 1)) / 3)],
  ['suited and connected', (high, low, pair, suited) => (pair ? 0 : (suited * Math.max(0, 3 - (high - low - 1))) / 3)],
  ['high card', (high, low, pair) => (pair ? 0 : high / 12)],
  ['kicker', (high, low, pair) => (pair ? 0 : low / 12)],
  ['ace', (high, low, pair) => (!pair && high === 12 ? 1 : 0)],
  ['suited ace', (high, low, pair, suited) => (!pair && high === 12 ? suited : 0)],
  ['two broadways', (high, low, pair) => (!pair && low >= 8 ? 1 : 0)],
];
const F = FEATURES.length;
const X = new Float64Array(N * F);
for (let c = 0; c < N; c++) {
  const [high, low] = classRanks(c);
  FEATURES.forEach(([, f], k) => (X[c * F + k] = f(high, low, isPairClass(c) ? 1 : 0, isSuitedClass(c) ? 1 : 0)));
}
const FORMULA = Float64Array.from({ length: N }, (_, c) => playability(c));

// ----- The model, as a linear function of playability -----
// For player p's class i against the other range o (card removal K): c_ij = K_ij o_j / sum_j K_ij o_j and
//   share_i = sum_j c_ij (e_ij + w (strength (e_ij - 0.5) + side + play_i - play_j))
//           = ebar_i + w (strength (ebar_i - 0.5) + side) + w (play_i - (C play)_i)
// so for fixed edge, strength and stack fade, the best playability vector is a ridge regression.
function prepare(rounds) {
  const payoffs = createPayoffs(table, DEFAULT_MODEL);
  const groups = [];
  for (const round of rounds) {
    for (const line of round.lines) {
      for (const p of line.players) {
        const other = line.players.find((o) => o !== p).classes;
        const C = new Float64Array(N * N);
        const ebar = new Float64Array(N);
        for (let i = 0; i < N; i++) {
          let mass = 0;
          for (let j = 0; j < N; j++) mass += payoffs.K[i * N + j] * other[j];
          for (let j = 0; j < N; j++) {
            const c = mass > 0 ? (payoffs.K[i * N + j] * other[j]) / mass : 0;
            C[i * N + j] = c;
            ebar[i] += c * table.equity[i][j];
          }
        }
        // Observations: every measured class, weighted by its combos (a pair's six = 1).
        const obs = [];
        for (let i = 0; i < N; i++) if (p.share[i] !== null) obs.push({ i, y: p.share[i], weight: CLASS_COMBOS[i] / 6, inChart: p.chart[i] });
        // sum over observations of weight * (e_i - C_i)(e_i - C_i)^T, for the normal equations
        const M = new Float64Array(N * N);
        for (const { i, weight } of obs) {
          const row = new Float64Array(N);
          for (let j = 0; j < N; j++) row[j] = -C[i * N + j];
          row[i] += 1;
          for (let a = 0; a < N; a++) {
            if (row[a] === 0) continue;
            const ra = weight * row[a];
            for (let b = 0; b < N; b++) M[a * N + b] += ra * row[b];
          }
        }
        // C X and C formula, for the feature fit
        const CX = new Float64Array(N * F);
        const Cf = new Float64Array(N);
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const c = C[i * N + j];
            if (c === 0) continue;
            Cf[i] += c * FORMULA[j];
            for (let k = 0; k < F; k++) CX[i * F + k] += c * X[j * F + k];
          }
        }
        groups.push({ tag: round.tag, lineId: line.lineId, spr: line.spr, seat: p.seat, name: p.name, C, ebar, obs, M, CX, Cf });
      }
    }
  }
  return groups;
}

// Solve A x = b (A symmetric positive definite, n x n) by Cholesky.
function solveSpd(A, b, n = N) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

// Predictions of one group for a model { edge, strength, sprScale, play }.
function predict(group, model) {
  const w = sprWeight(Math.min(16, Math.round(group.spr * 2) / 2), model.sprScale);
  const side = group.seat === 0 ? -model.edge : model.edge;
  return Float64Array.from({ length: N }, (_, i) => {
    let cp = 0;
    for (let j = 0; j < N; j++) cp += group.C[i * N + j] * model.play[j];
    return group.ebar[i] + w * (model.strength * (group.ebar[i] - 0.5) + side) + w * (model.play[i] - cp);
  });
}

// The playability that best fits the measurements for given edge, strength and fade, pulled toward the
// hand-written formula (times priorScale) by `ridge` (in units of one pair's observation).
function fitPlay(groups, { edge, strength, sprScale, priorScale }, ridge) {
  const prior = Float64Array.from({ length: N }, (_, c) => priorScale * playability(c));
  const A = new Float64Array(N * N);
  const b = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    A[k * N + k] = ridge;
    b[k] = ridge * prior[k];
  }
  for (const g of groups) {
    const w = sprWeight(Math.min(16, Math.round(g.spr * 2) / 2), sprScale);
    const side = g.seat === 0 ? -edge : edge;
    for (let k = 0; k < N * N; k++) A[k] += w * w * g.M[k];
    // residual without playability: a = ebar + w (strength (ebar - 0.5) + side) - y; row = w (e_i - C_i)
    for (const { i, y, weight } of g.obs) {
      const a = g.ebar[i] + w * (strength * (g.ebar[i] - 0.5) + side) - y;
      for (let j = 0; j < N; j++) b[j] += weight * a * w * g.C[i * N + j];
      b[i] -= weight * a * w;
    }
  }
  return { play: solveSpd(A, b), prior };
}

// Feature fit: playability = the formula (times priorScale) + X beta, beta by ridge regression (lambda per
// feature, in units of one pair's observation).
function fitPlayFeatures(groups, { edge, strength, sprScale, priorScale }, lambda) {
  const prior = Float64Array.from(FORMULA, (v) => priorScale * v);
  const A = new Float64Array(F * F);
  const b = new Float64Array(F);
  for (let k = 0; k < F; k++) A[k * F + k] = lambda;
  const z = new Float64Array(F);
  for (const g of groups) {
    const w = sprWeight(Math.min(16, Math.round(g.spr * 2) / 2), sprScale);
    const side = g.seat === 0 ? -edge : edge;
    for (const { i, y, weight } of g.obs) {
      // residual = c + z . beta, with z = w (X_i - (C X)_i) and c everything that doesn't depend on beta
      for (let k = 0; k < F; k++) z[k] = w * (X[i * F + k] - g.CX[i * F + k]);
      const c = g.ebar[i] + w * (strength * (g.ebar[i] - 0.5) + side) - y + w * (prior[i] - priorScale * g.Cf[i]);
      for (let p = 0; p < F; p++) {
        b[p] -= weight * c * z[p];
        for (let q = 0; q < F; q++) A[p * F + q] += weight * z[p] * z[q];
      }
    }
  }
  const beta = solveSpd(A, b, F);
  const play = Float64Array.from(prior, (v, c) => {
    let x = v;
    for (let k = 0; k < F; k++) x += X[c * F + k] * beta[k];
    return x;
  });
  return { play, prior, beta };
}

// Weighted RMS error over the observations (only the chart's own hands, or all of them).
function rms(groups, model, chartOnly = false) {
  let err = 0;
  let total = 0;
  for (const g of groups) {
    const pred = predict(g, model);
    for (const { i, y, weight, inChart } of g.obs) {
      const wt = chartOnly ? weight * inChart : weight;
      err += wt * (pred[i] - y) ** 2;
      total += wt;
    }
  }
  return Math.sqrt(err / total);
}

function nelderMead(f, start, steps, iterations = 200) {
  let scored = [start, ...start.map((_, d) => start.map((x, i) => (i === d ? x + steps[d] : x)))].map((x) => ({ x, f: f(x) }));
  for (let it = 0; it < iterations; it++) {
    scored.sort((a, b) => a.f - b.f);
    const kept = scored.slice(0, -1);
    const centroid = kept[0].x.map((_, i) => kept.reduce((s, v) => s + v.x[i], 0) / kept.length);
    const worst = scored.at(-1);
    const along = (t) => centroid.map((c, i) => c + t * (worst.x[i] - c));
    const reflected = along(-1);
    const fr = f(reflected);
    if (fr < scored[0].f) {
      const expanded = along(-2);
      const fe = f(expanded);
      scored[scored.length - 1] = fe < fr ? { x: expanded, f: fe } : { x: reflected, f: fr };
    } else if (fr < scored.at(-2).f) {
      scored[scored.length - 1] = { x: reflected, f: fr };
    } else {
      const contracted = along(0.5);
      const fc = f(contracted);
      if (fc < worst.f) scored[scored.length - 1] = { x: contracted, f: fc };
      else scored = scored.map((v, k) => (k === 0 ? v : { x: v.x.map((x, i) => scored[0].x[i] + 0.5 * (x - scored[0].x[i])) })).map((v) => ({ ...v, f: v.f ?? f(v.x) }));
    }
  }
  scored.sort((a, b) => a.f - b.f);
  return scored[0];
}

const SHOW = ['AA', 'KK', 'QQ', 'TT', '77', '44', '22', 'AKs', 'AKo', 'AQo', 'AJo', 'ATs', 'A5s', 'KQs', 'KJo', 'K9o', 'QJs', 'Q8o', 'JTs', 'J7s', 'T9s', '76s', '54s', '72o'];
function report(groups, model, label) {
  console.log(`\n${label}: error ${(100 * rms(groups, model)).toFixed(2)} points of pot share (chart's own hands ${(100 * rms(groups, model, true)).toFixed(2)})`);
  for (const g of groups) {
    const pred = predict(g, model);
    const at = new Map(g.obs.map((o) => [o.i, o]));
    console.log(`  ${g.tag} ${g.lineId} ${g.name} (stacks ${g.spr.toFixed(1)}x the pot)  equity / measured / model %`);
    console.log('    ' + SHOW.map((n) => CLASS_NAMES.indexOf(n)).filter((c) => at.has(c)).map((c) => `${CLASS_NAMES[c]} ${(100 * g.ebar[c]).toFixed(0)}/${(100 * at.get(c).y).toFixed(0)}/${(100 * pred[c]).toFixed(0)}`).join('  '));
  }
}

// ----- Measure -----
if (arg('charts') || arg('tag')) {
  const tag = arg('tag', 'app');
  if (arg('charts')) useCharts(resolve(arg('charts')));
  // accuracy: TexasSolver's target exploitability, % of the pot (the flop sample's noise is far bigger)
  const options = { flops: Number(arg('flops', 20)), probe: Number(arg('probe', 0.03)), parallel: Number(arg('parallel', 1)), accuracy: Number(arg('accuracy', 2.5)), maxIterations: Number(arg('max-iterations', 200)), seed: Number(arg('seed', 11)) };
  const lines = [];
  for (const id of arg('lines', 'srp_btn_bb,3bp_co_btn').split(',')) lines.push(await measure(id, options));
  writeFileSync(dataFile(tag), JSON.stringify({ tag, charts: arg('charts', 'app'), ...options, tree: CAL_TREE, lines }));
  console.log(`measured: ${dataFile(tag)}`);
}

// ----- Fit (pooled over the given rounds) -----
if (arg('fit')) {
  const rounds = arg('fit').split(',').map((tag) => {
    if (!existsSync(dataFile(tag))) throw new Error(`No measurements for ${tag}: run with --tag ${tag} first`);
    return JSON.parse(readFileSync(dataFile(tag), 'utf8'));
  });
  const groups = prepare(rounds);
  const ridge = Number(arg('ridge', 2));
  const formula = (edge, strength, sprScale, priorScale) => ({ edge, strength, sprScale, play: Float64Array.from({ length: N }, (_, c) => priorScale * playability(c)) });
  report(groups, formula(0.09, 0.36, 4, 1.31), 'Previous transfer model (formula playability)');

  // Outer search over edge, strength, fade and the prior's scale; playability solved exactly inside.
  const features = arg('play', 'features') === 'features';
  const lambda = Number(arg('lambda', 1));
  const toModel = ([edge, strength, sprScale, priorScale]) => {
    const globals = { edge, strength, sprScale: Math.min(16, Math.max(0.5, sprScale)), priorScale };
    return { ...globals, ...(features ? fitPlayFeatures(groups, globals, lambda) : fitPlay(groups, globals, ridge)) };
  };
  const objective = (x) => {
    const m = toModel(x);
    let pen = 0;
    if (features) for (let k = 0; k < F; k++) pen += lambda * m.beta[k] ** 2;
    else for (let c = 0; c < N; c++) pen += ridge * (m.play[c] - m.prior[c]) ** 2;
    let err = 0;
    for (const g of groups) {
      const pred = predict(g, m);
      for (const { i, y, weight } of g.obs) err += weight * (pred[i] - y) ** 2;
    }
    return err + pen;
  };
  const best = nelderMead(objective, [0.09, 0.36, 6, 1.3], [0.03, 0.2, 3, 0.5]);
  const fitted = toModel(best.x);
  console.log(`\nFitted: edge ${fitted.edge.toFixed(3)}, strength ${fitted.strength.toFixed(3)}, sprScale ${fitted.sprScale.toFixed(2)}, priorScale ${fitted.priorScale.toFixed(2)} (${features ? `features, lambda ${lambda}` : `free, ridge ${ridge}`})`);
  if (features) console.log(`  features: ${FEATURES.map(([name], k) => `${name} ${fitted.beta[k] >= 0 ? '+' : ''}${(100 * fitted.beta[k]).toFixed(1)}`).join(', ')}`);
  report(groups, fitted, 'Fitted model (fitted playability)');
  const moved = [...fitted.play].map((v, c) => ({ c, d: v - fitted.prior[c] })).sort((a, b) => b.d - a.d);
  const fmt = ({ c, d }) => `${CLASS_NAMES[c]} ${d > 0 ? '+' : ''}${(100 * d).toFixed(1)}`;
  console.log(`  plays better than the formula: ${moved.slice(0, 14).map(fmt).join('  ')}`);
  console.log(`  plays worse than the formula:  ${moved.slice(-14).reverse().map(fmt).join('  ')}`);

  const model = { ...DEFAULT_MODEL, form: 'transfer', edge: +fitted.edge.toFixed(4), strength: +fitted.strength.toFixed(4), sprScale: +fitted.sprScale.toFixed(3), play: [...fitted.play].map((v) => +v.toFixed(4)) };
  const out = arg('out', join(WORK, `model-${rounds.map((r) => r.tag).join('+')}.json`));
  writeFileSync(out, JSON.stringify(model));
  console.log(`model: ${out}`);
}
