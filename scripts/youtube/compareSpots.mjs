// Runs the coach on every YouTube spot (tests/fixtures/hungry-horse/spots.json) and compares its play at each key
// decision with the video's. Each spot is analysed twice: everyone plays GTO, and with the reads the video gives
// the villains (a fish, a sticky reg...). Writes tests/fixtures/hungry-horse/results.json.
//   node scripts/youtube/compareSpots.mjs [--only hh-04,hh-08] [--detail full|fast] [--timed] [--jobs 6] [--out file.json]
// Solves run a fixed number of iterations ("steady"), so the comparison is the same on every run and machine;
// --timed stops them at the app's time limit instead (what a review in the app does, but verdicts on close
// spots then change with how busy the CPU is). --jobs runs several spots at once.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { setChartLoader } from '../../src/gto/preflop/charts.js';
import { analyzeHand } from '../../src/coach/analyzeHand.js';
import { buildSpot, decisionIndex } from './buildSpot.mjs';

setChartLoader(async (name) => new Uint8Array(readFileSync(new URL(`../../src/gto/preflop/charts/${name}.pfc`, import.meta.url))));

const FIXTURES = new URL('../../tests/fixtures/hungry-horse/', import.meta.url);
const argv = isMainThread ? process.argv : workerData.argv;
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const detail = arg('--detail') ?? 'full';
const steady = !argv.includes('--timed');
const only = arg('--only')?.split(',');
const jobs = Math.max(1, Number(arg('--jobs') ?? 1));

// The coach makes the video's play at least this often: agree; at least MIXED_FROM: a mix. Less often than that
// it's "close" when the video's play gives up at most CLOSE_LOSS of the pot by the coach's numbers (the coach
// prefers another play but has no real objection to this one: with two plays worth the same, which of them it
// calls best is a coin flip), and a disagreement otherwise.
const AGREE_FROM = 0.5;
const MIXED_FROM = 0.15;
const CLOSE_LOSS = 0.01;

const KIND = { fold: 'fold', check: 'check', call: 'call', bet: 'aggressive', raise: 'aggressive', allin: 'aggressive' };
const round = (x, digits = 2) => (x === null || x === undefined ? null : Number(x.toFixed(digits)));

// Is this option the play the video recommends? youtube: { play: fold|check|call|bet|raise, size? }, where size is
// 'allin' or { minPot, maxPot } (a bet as a share of the pot before it).
function isYoutubePlay(option, youtube, pot) {
  const kind = youtube.play === 'bet' || youtube.play === 'raise' ? 'aggressive' : youtube.play;
  if (KIND[option.type] !== kind) return false;
  if (!youtube.size) return true;
  if (youtube.size === 'allin') return option.type === 'allin';
  const share = option.to / pot;
  return share >= (youtube.size.minPot ?? 0) - 0.02 && share <= (youtube.size.maxPot ?? Infinity) + 0.02;
}

// What the coach says at one decision, next to the video's play.
function compare(decision, youtube, bb) {
  if (!decision) return { graded: false, reason: 'The hero has no decision here.', verdict: 'not graded' };
  if (!decision.graded) return { graded: false, reason: decision.reason, verdict: 'not graded' };
  const options = decision.options.map((o) => ({
    label: o.label,
    type: o.type,
    kind: KIND[o.type],
    potShare: o.to !== undefined && (o.type === 'bet' || o.type === 'allin') && decision.toCall === 0 ? round(o.to / decision.pot) : null,
    frequency: round(o.frequency, 3),
    evBB: o.ev === null ? null : round(o.ev / bb),
    youtube: isYoutubePlay(o, youtube, decision.pot),
  }));
  const picked = options.filter((o) => o.youtube);
  const frequency = picked.reduce((sum, o) => sum + o.frequency, 0);
  const bestEv = Math.max(...options.map((o) => o.evBB ?? -Infinity));
  const youtubeEv = picked.length ? Math.max(...picked.map((o) => o.evBB ?? -Infinity)) : null;
  const loss = youtubeEv === null || !Number.isFinite(bestEv) ? null : Math.max(0, bestEv - youtubeEv);
  const close = loss !== null && (loss * bb) / decision.potRef <= CLOSE_LOSS;
  return {
    graded: true,
    best: { label: decision.best.label, kind: KIND[decision.best.type] },
    youtubeFrequency: round(frequency, 3),
    youtubeOffered: picked.length > 0,
    youtubeEvLossBB: round(loss),
    // The same loss as a share of the pot being played for (the pot plus the call).
    youtubeEvLossPot: loss === null ? null : round((loss * bb) / decision.potRef, 4),
    verdict: !picked.length ? 'not offered' : frequency >= AGREE_FROM ? 'agree' : frequency >= MIXED_FROM ? 'mixed' : close ? 'close' : 'disagree',
    hero: { did: decision.actual?.label ?? null, score: decision.score, grade: decision.grade?.label ?? null },
    equity: round(decision.equity, 3),
    potBB: round(decision.pot / bb, 1),
    toCallBB: round(decision.toCall / bb, 1),
    villains: decision.reads.map((r) => ({ position: r.position, read: r.label, width: r.width, top: r.top })),
    options,
  };
}

// Analyse one spot (with or without reads) and pick out its key decisions.
async function run(spot, reads) {
  const { record, heroDecisions } = buildSpot(spot, { reads });
  const started = Date.now();
  const report = await analyzeHand(record, { detail, steady });
  const seconds = (Date.now() - started) / 1000;
  return {
    seconds,
    decisions: spot.decisions.map((key) => {
      const index = decisionIndex(heroDecisions, key);
      return compare(report.decisions.find((d) => d.index === index), key.youtube, spot.stakes.bb);
    }),
  };
}

// Both runs of one spot: { id, seconds, decisions: [{ street, youtube, heroDid, gto, reads }] }.
async function compareSpot(spot) {
  const gto = await run(spot, false);
  const hasReads = Object.keys(spot.reads ?? {}).length > 0;
  const read = hasReads ? await run(spot, true) : null;
  return {
    id: spot.id,
    seconds: Math.round(gto.seconds + (read?.seconds ?? 0)),
    decisions: spot.decisions.map((key, k) => ({
      street: key.street,
      youtube: key.youtube,
      heroDid: key.heroDid,
      gto: gto.decisions[k],
      reads: read ? read.decisions[k] : null,
    })),
  };
}

const { spots } = JSON.parse(readFileSync(new URL('spots.json', FIXTURES), 'utf8'));

if (!isMainThread) {
  // A worker: compares the spots it's handed, one at a time.
  parentPort.on('message', async (id) => parentPort.postMessage(await compareSpot(spots.find((s) => s.id === id))));
} else {
  const wanted = spots.filter((s) => !only || only.includes(s.id));
  const done = new Map();
  const report = (result) => {
    done.set(result.id, result);
    const line = result.decisions.map((d) => `${d.street} ${d.youtube.play}: GTO ${d.gto.verdict}${d.reads ? `, reads ${d.reads.verdict}` : ''}`).join(' | ');
    console.log(`${result.id} (${result.seconds}s) ${line}`);
  };
  if (jobs === 1) {
    for (const spot of wanted) report(await compareSpot(spot));
  } else {
    const queue = wanted.map((s) => s.id);
    await Promise.all(
      Array.from({ length: Math.min(jobs, queue.length) }, () => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { argv: process.argv } });
        return new Promise((resolve, reject) => {
          const next = () => (queue.length ? worker.postMessage(queue.shift()) : worker.terminate().then(resolve));
          worker.on('message', (result) => {
            report(result);
            next();
          });
          worker.on('error', reject);
          next();
        });
      }),
    );
  }
  const results = wanted.map((s) => {
    const { seconds, ...rest } = done.get(s.id);
    return rest;
  });

  // Totals: how often the coach agrees with the video, everyone GTO and with reads, and what the video's plays
  // cost on average by the coach's numbers (as a share of the pot being played for).
  const tally = (pick) => {
    const counts = { agree: 0, mixed: 0, close: 0, disagree: 0, 'not offered': 0, 'not graded': 0 };
    const losses = [];
    for (const r of results) {
      for (const d of r.decisions) {
        if (!pick(d)) continue;
        counts[pick(d).verdict] += 1;
        if (pick(d).graded && pick(d).youtubeEvLossPot !== null) losses.push(pick(d).youtubeEvLossPot);
      }
    }
    return { ...counts, averageLossPot: losses.length ? round(losses.reduce((sum, x) => sum + x, 0) / losses.length, 4) : null };
  };
  const commit = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: new URL('../..', import.meta.url) }).toString().trim();
    } catch {
      return null;
    }
  })();
  const file = {
    kind: 'pokerwiz-youtube-comparison',
    version: 2,
    generatedAt: new Date().toISOString(),
    appVersion: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
    commit,
    detail,
    steady,
    thresholds: { agree: AGREE_FROM, mixed: MIXED_FROM, close: CLOSE_LOSS },
    totals: { gto: tally((d) => d.gto), reads: tally((d) => d.reads) },
    results,
  };
  const out = arg('--out');
  if (out || !only) writeFileSync(out ?? new URL('results.json', FIXTURES), `${JSON.stringify(file, null, 1)}\n`);
  console.log('\nGTO:', file.totals.gto, '\nWith reads:', file.totals.reads);
}
