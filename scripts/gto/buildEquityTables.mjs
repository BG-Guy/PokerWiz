// Builds the all-in equity tables the preflop solver needs (offline, run once; the output is committed):
//   heads-up  equity of every starting-hand class against every other (169 x 169) by Monte Carlo over the
//             compatible combo pairs, plus the exact count of compatible combo pairs (card removal)
//   3-way     equity of every class against two opponents holding hands from strength buckets y and z
//             (169 x B x B); buckets are finer at the top, where 3-way pots are played
// Output: scripts/gto/data/equity.json. Run: node scripts/gto/buildEquityTables.mjs [heads-up samples per matchup]
// Spreads the work over worker threads (one per CPU core).
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { evaluate } from '../../src/utils/handEvaluator.js';
import { CLASS_COUNT, CLASS_HANDS, CLASS_COMBOS, CLASS_NAMES, HAND_CARDS } from '../../src/gto/cards.js';
import { createRandom } from '../../src/coach/random.js';

// Bucket boundaries, as the share of all combos (strongest first) each bucket ends at.
const BUCKET_EDGES = [0.012, 0.024, 0.036, 0.05, 0.065, 0.08, 0.1, 0.12, 0.145, 0.17, 0.2, 0.23, 0.27, 0.31, 0.36, 0.42, 0.49, 0.57, 0.66, 0.77, 0.88, 1];
const BUCKETS = BUCKET_EDGES.length;

// ----- Sampling helpers (used by the workers) -----

// Deal 5 board cards that aren't in `used` (a stamp array: used[card] === stamp means taken).
function dealBoard(random, used, stamp, board) {
  let filled = 0;
  while (filled < 5) {
    const card = Math.floor(random() * 52);
    if (used[card] === stamp) continue;
    used[card] = stamp;
    board[filled++] = card;
  }
}

// Heads-up equity of class a against class b, and their compatible combo pairs.
function headsUp(a, b, samples, random) {
  const pairs = [];
  for (const ha of CLASS_HANDS[a]) {
    for (const hb of CLASS_HANDS[b]) {
      const [a1, a2] = HAND_CARDS[ha];
      const [b1, b2] = HAND_CARDS[hb];
      if (a1 !== b1 && a1 !== b2 && a2 !== b1 && a2 !== b2) pairs.push([HAND_CARDS[ha], HAND_CARDS[hb]]);
    }
  }
  if (!pairs.length) return { equity: 0.5, compatible: 0 };
  const used = new Int32Array(52);
  const board = new Array(5);
  let won = 0;
  for (let s = 0; s < samples; s++) {
    const [ca, cb] = pairs[s % pairs.length];
    const stamp = s + 1;
    used[ca[0]] = used[ca[1]] = used[cb[0]] = used[cb[1]] = stamp;
    dealBoard(random, used, stamp, board);
    const sa = evaluate(ca, board, 5);
    const sb = evaluate(cb, board, 5);
    won += sa > sb ? 1 : sa === sb ? 0.5 : 0;
  }
  return { equity: won / samples, compatible: pairs.length };
}

// 3-way equity (pot share) of class a against one hand from each of two buckets.
function threeWay(a, handsY, handsZ, samples, random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const used = new Int32Array(52);
  const board = new Array(5);
  let share = 0;
  let done = 0;
  let stamp = 0;
  for (let tries = 0; done < samples && tries < samples * 6; tries++) {
    const ha = HAND_CARDS[pick(CLASS_HANDS[a])];
    const hy = HAND_CARDS[pick(handsY)];
    const hz = HAND_CARDS[pick(handsZ)];
    stamp++;
    let clash = false;
    for (const card of [...ha, ...hy, ...hz]) {
      if (used[card] === stamp) clash = true;
      used[card] = stamp;
    }
    if (clash) continue;
    dealBoard(random, used, stamp, board);
    const sa = evaluate(ha, board, 5);
    const sy = evaluate(hy, board, 5);
    const sz = evaluate(hz, board, 5);
    const best = Math.max(sa, sy, sz);
    if (sa === best) share += 1 / (1 + (sy === best) + (sz === best));
    done++;
  }
  return done ? share / done : 1 / 3;
}

// ----- Worker: computes one job's rows and sends them back -----
if (!isMainThread) {
  const { job, samples, bucketHands } = workerData;
  const random = createRandom(9001 + job.rows[0] * 7919 + (job.kind === '3way' ? 1 : 0));
  const out = [];
  for (const a of job.rows) {
    if (job.kind === 'hu') {
      const row = [];
      for (let b = a; b < CLASS_COUNT; b++) row.push(headsUp(a, b, samples, random));
      out.push({ a, row });
    } else {
      const row = new Array(BUCKETS * BUCKETS).fill(0);
      for (let y = 0; y < BUCKETS; y++) {
        for (let z = y; z < BUCKETS; z++) {
          const value = threeWay(a, bucketHands[y], bucketHands[z], samples, random);
          row[y * BUCKETS + z] = value;
          row[z * BUCKETS + y] = value;
        }
      }
      out.push({ a, row });
    }
  }
  parentPort.postMessage(out);
} else {
  await main();
}

// Run jobs (lists of class rows) over a pool of workers; resolves with every job's results.
async function runPool(kind, samples, extra = {}) {
  const threads = Math.max(1, cpus().length - 1);
  // Interleave rows so every worker gets a mix of cheap and expensive ones.
  const jobs = Array.from({ length: threads * 4 }, (_, k) => ({ kind, rows: [] }));
  for (let a = 0; a < CLASS_COUNT; a++) jobs[a % jobs.length].rows.push(a);
  const results = [];
  let next = 0;
  let finished = 0;
  await new Promise((resolve, reject) => {
    const startOne = () => {
      if (next >= jobs.length) return;
      const job = jobs[next++];
      const worker = new Worker(new URL(import.meta.url), { workerData: { job, samples, ...extra } });
      worker.once('message', (rows) => {
        results.push(...rows);
        finished++;
        process.stdout.write(`\r${kind}: ${finished}/${jobs.length} jobs`);
        if (finished === jobs.length) resolve();
        else startOne();
      });
      worker.once('error', reject);
    };
    for (let t = 0; t < threads; t++) startOne();
  });
  process.stdout.write('\n');
  return results;
}

async function main() {
  const samples = Number(process.argv[2] ?? 20000);
  const started = Date.now();

  // Heads-up table.
  const equity = Array.from({ length: CLASS_COUNT }, () => new Array(CLASS_COUNT).fill(0.5));
  const compatible = Array.from({ length: CLASS_COUNT }, () => new Array(CLASS_COUNT).fill(0));
  for (const { a, row } of await runPool('hu', samples)) {
    row.forEach(({ equity: e, compatible: n }, k) => {
      const b = a + k;
      equity[a][b] = e;
      equity[b][a] = a === b ? 0.5 : 1 - e;
      compatible[a][b] = compatible[b][a] = n;
    });
  }

  // Buckets: classes by equity against a random hand (combo-weighted), cut at BUCKET_EDGES.
  const vsRandom = equity.map((row, a) => {
    let sum = 0;
    let weight = 0;
    row.forEach((e, b) => {
      sum += e * compatible[a][b];
      weight += compatible[a][b];
    });
    return sum / weight;
  });
  const byStrength = [...Array(CLASS_COUNT).keys()].sort((x, y) => vsRandom[y] - vsRandom[x]);
  const bucketOf = new Array(CLASS_COUNT);
  let mass = 0;
  for (const cls of byStrength) {
    const middle = (mass + CLASS_COMBOS[cls] / 2) / 1326;
    bucketOf[cls] = BUCKET_EDGES.findIndex((edge) => middle <= edge);
    mass += CLASS_COMBOS[cls];
  }
  const bucketHands = Array.from({ length: BUCKETS }, () => []);
  for (let cls = 0; cls < CLASS_COUNT; cls++) bucketHands[bucketOf[cls]].push(...CLASS_HANDS[cls]);

  // 3-way table.
  const threeWayTable = new Array(CLASS_COUNT);
  for (const { a, row } of await runPool('3way', Math.max(600, Math.round(samples / 12)), { bucketHands })) threeWayTable[a] = row;

  const round4 = (x) => Math.round(x * 10000) / 10000;
  mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
  writeFileSync(
    new URL('./data/equity.json', import.meta.url),
    JSON.stringify({
      samples,
      classes: CLASS_NAMES,
      equity: equity.map((row) => row.map(round4)),
      compatible,
      vsRandom: vsRandom.map(round4),
      buckets: BUCKETS,
      bucketOf,
      threeWay: threeWayTable.map((row) => row.map(round4)),
    })
  );
  const at = (name) => CLASS_NAMES.indexOf(name);
  console.log(
    `done in ${Math.round((Date.now() - started) / 1000)} s. AA vs KK ${equity[at('AA')][at('KK')].toFixed(3)}, ` +
      `AKs vs QQ ${equity[at('AKs')][at('QQ')].toFixed(3)}, 72o vs random ${vsRandom[at('72o')].toFixed(3)}`
  );
}
