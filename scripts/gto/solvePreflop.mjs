// Solves the 8-max preflop game at every stack depth the app uses and writes the charts it reads
// (src/gto/preflop/charts/*.pfc, gzip) plus a manifest with each chart's headline numbers.
//
//   cash-<stack>   no ante (cash games)
//   ante-<stack>   1 big-blind ante (tournaments)
//
// Run: node scripts/gto/solvePreflop.mjs [--iterations 600] [--only cash-100,ante-20]
// Needs scripts/gto/data/equity.json (node scripts/gto/buildEquityTables.mjs). Each depth runs in its own
// worker thread; a full run takes a few minutes per depth.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createPreflopSolver } from './preflop/cfr.mjs';
import { encodeChart } from '../../src/gto/preflop/chartFormat.js';
import { CLASS_COMBOS, CLASS_NAMES } from '../../src/gto/cards.js';
import { POSITIONS } from '../../src/gto/preflop/tree.js';
import { CHART_CONFIGS as CONFIGS } from '../../src/gto/preflop/configs.js';

// Nodes the opponents reach less often than this (averaged over the actor's hands) are left out of the chart;
// the app falls back to the closest node it has.
const KEEP_THRESHOLD = 1e-4;

const CHART_DIR = new URL('../../src/gto/preflop/charts/', import.meta.url);

// Share of all hands taking each action at a node (for the summary).
function frequencies(node, strategy) {
  const A = node.actions.length;
  const out = new Array(A).fill(0);
  for (let c = 0; c < 169; c++) for (let a = 0; a < A; a++) out[a] += (CLASS_COMBOS[c] * strategy[a * 169 + c]) / 1326;
  return out;
}

// ----- Worker: solve one config -----
if (!isMainThread) {
  const { config, iterations, table } = workerData;
  const started = Date.now();
  const solver = createPreflopSolver({ stack: config.stack, ante: config.ante, table });
  for (let done = 0; done < iterations; done += 50) {
    solver.run(Math.min(50, iterations - done));
    parentPort.postMessage({ progress: Math.min(iterations, done + 50) });
  }
  const { strategies, losses, opponentReach } = solver.finish();
  const tree = solver.tree;
  const nodes = tree.decisions.map((node, id) => (id === 0 || opponentReach[id] >= KEEP_THRESHOLD ? { strategy: strategies[id], loss: losses[id] } : null));
  const bytes = gzipSync(encodeChart({ stack: config.stack, ante: config.ante, tree, nodes }), { level: 9 });

  // Headline numbers: opening width per position, and how often premiums 3-bet a cutoff open from the button.
  const opens = {};
  let key = '';
  for (let p = 0; p < 7; p++) {
    const node = tree.decisions.find((n) => n.key === key);
    const freq = frequencies(node, strategies[node.id]);
    opens[POSITIONS[p]] = Object.fromEntries(node.actions.map((a, k) => [a.type, Math.round(freq[k] * 1000) / 10]));
    key = key ? `${key}|${POSITIONS[p]}:f` : `${POSITIONS[p]}:f`;
  }
  const vsCutoff = tree.decisions.find((n) => n.key.startsWith('UTG:f|UTG+1:f|LJ:f|HJ:f|CO:r') && n.key.split('|').length === 5);
  const raises = vsCutoff.actions.map((a, k) => (a.type === 'raise' || a.type === 'allin' ? k : -1)).filter((k) => k >= 0);
  const premiums = ['AA', 'KK', 'QQ', 'AKs', 'AKo'].map((name) => {
    const c = CLASS_NAMES.indexOf(name);
    return `${name} ${Math.round(raises.reduce((sum, k) => sum + strategies[vsCutoff.id][k * 169 + c], 0) * 100)}%`;
  });
  parentPort.postMessage({
    done: true,
    bytes,
    stats: {
      seconds: Math.round((Date.now() - started) / 1000),
      decisions: tree.decisions.length,
      kept: nodes.filter(Boolean).length,
      size: bytes.length,
      opens,
      premiums,
    },
  });
} else {
  await main();
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : fallback;
  };
  const iterations = Number(option('iterations', 600));
  const only = option('only', '')
    .split(',')
    .filter(Boolean);
  const configs = only.length ? CONFIGS.filter((c) => only.includes(c.name)) : CONFIGS;
  const table = JSON.parse(readFileSync(new URL('./data/equity.json', import.meta.url), 'utf8'));
  mkdirSync(CHART_DIR, { recursive: true });

  const manifestUrl = new URL('manifest.json', CHART_DIR);
  let manifest = [];
  try {
    manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  } catch {
    // first run: no manifest yet
  }

  // Biggest trees first, so the slow ones start early.
  const queue = [...configs].sort((a, b) => b.stack - a.stack);
  const threads = Math.min(queue.length, Math.max(1, cpus().length - 2));
  await new Promise((resolve, reject) => {
    let running = 0;
    const startNext = () => {
      if (!queue.length) {
        if (running === 0) resolve();
        return;
      }
      const config = queue.shift();
      running++;
      const worker = new Worker(new URL(import.meta.url), { workerData: { config, iterations, table } });
      worker.on('message', (message) => {
        if (message.progress) return;
        writeFileSync(new URL(`${config.name}.pfc`, CHART_DIR), message.bytes);
        manifest = manifest.filter((m) => m.name !== config.name);
        manifest.push({ ...config, iterations, ...message.stats });
        const s = message.stats;
        console.log(
          `${config.name}: ${s.seconds}s, ${s.kept}/${s.decisions} nodes, ${Math.round(s.size / 1024)} KB | opens ` +
            ['UTG', 'HJ', 'CO', 'BTN'].map((p) => `${p} ${Math.round(((s.opens[p].raise ?? 0) + (s.opens[p].allin ?? 0)) * 10) / 10}%`).join(' ') +
            ` | SB ${JSON.stringify(s.opens.SB)} | BTN 3-bets vs CO: ${s.premiums.join(', ')}`
        );
      });
      worker.on('error', reject);
      worker.on('exit', () => {
        running--;
        startNext();
      });
    };
    for (let t = 0; t < threads; t++) startNext();
  });
  manifest.sort((a, b) => a.ante - b.ante || a.stack - b.stack);
  writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
}
