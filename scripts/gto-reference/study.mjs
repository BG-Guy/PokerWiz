// Where the engine's error comes from: the same flop decisions scored against the reference with one shortcut
// relaxed at a time (more iterations, more runouts sampled, river betting kept in flop solves).
//   node scripts/gto-reference/study.mjs --boards K72,T96 [--variants app,iter1000,app@40] [--nodes btn_vs_check,bb_vs_33]
import { flopStart, toTexasRange, toEngineRange } from './ranges.mjs';
import { solveTexas, texasLine } from './texas.mjs';
import { solveEngine } from './engine.mjs';
import { compareNode } from './compare.mjs';
import { BOARDS, FLOP_TREE, FLOP_NODES, lineInBB } from './spots.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

// Each variant runs a fixed number of iterations (no time limit), so a busy machine doesn't change the result.
// The app's full budget (heads-up flop) is in src/gto/postflop/solver.js; in the app a solve stops at its time
// limit, so compare variants at equal time with "name@iterations" (scratch timing: iterations x ms per pass).
const FOREVER = 1e9;
const VARIANTS = {
  appRandom: { sampling: { mode: 'random' }, iterations: 260, ms: FOREVER },
  app: { iterations: 260, ms: FOREVER },
  appFast: { detail: 'fast', iterations: 150, ms: FOREVER },
  fastRandom: { detail: 'fast', sampling: { mode: 'random' }, iterations: 150, ms: FOREVER },
  fast8x3: { detail: 'fast', sampling: { turns: 8, rivers: 3 }, iterations: 150, ms: FOREVER },
  fastFullTree: { detail: 'full', sampling: { turns: 8, rivers: 3 }, iterations: 150, ms: FOREVER },
  iter1000: { iterations: 1000, ms: FOREVER },
  spread12x4: { sampling: { turns: 12, rivers: 4 }, iterations: 260, ms: FOREVER },
  spread16x3: { sampling: { turns: 16, rivers: 3 }, iterations: 260, ms: FOREVER },
  riverBetting: { sampling: { betting: 3 }, iterations: 260, ms: FOREVER },
  river12x4: { sampling: { turns: 12, rivers: 4, betting: 3 }, iterations: 260, ms: FOREVER },
  river8x3: { sampling: { turns: 8, rivers: 3, betting: 3 }, iterations: 260, ms: FOREVER },
  // Rivers sampled per training pass (riverDraw of them, rotating): cheaper passes, so more of them in the
  // same time; the 8-river version covers twice the rivers for the cost of the app's 4.
  draw2: { sampling: { turns: 12, rivers: 4, riverDraw: 2 }, iterations: 260, ms: FOREVER },
  rivers8draw2: { sampling: { turns: 12, rivers: 8, riverDraw: 2 }, iterations: 260, ms: FOREVER },
  river8x4draw2: { sampling: { turns: 8, rivers: 4, betting: 3, riverDraw: 2 }, iterations: 260, ms: FOREVER },
  t16r6d2: { sampling: { turns: 16, rivers: 6, riverDraw: 2 }, iterations: 260, ms: FOREVER },
  t20r6d2: { sampling: { turns: 20, rivers: 6, riverDraw: 2 }, iterations: 260, ms: FOREVER },
  t16r8d2: { sampling: { turns: 16, rivers: 8, riverDraw: 2 }, iterations: 260, ms: FOREVER },
  fast8x6draw2: { detail: 'fast', sampling: { turns: 8, rivers: 6, riverDraw: 2 }, iterations: 150, ms: FOREVER },
  fast12x6draw2: { detail: 'fast', sampling: { turns: 12, rivers: 6, riverDraw: 2 }, iterations: 150, ms: FOREVER },
  turns49x2: { sampling: { turns: 49, rivers: 2 }, iterations: 200, ms: FOREVER },
};

const boards = arg('boards', 'K72').split(',');
const variants = arg('variants', Object.keys(VARIANTS).join(',')).split(',');
// "name@40" runs variant `name` for 40 iterations (what a time-capped solve in the app gets to).
function variantOf(v) {
  const [name, iterations] = v.split('@');
  if (!VARIANTS[name]) throw new Error(`Unknown variant ${name}`);
  return { ...VARIANTS[name], ...(iterations ? { iterations: Number(iterations) } : {}) };
}
const start = await flopStart('srp_btn_bb');
const oop = toEngineRange(start.oop);
const ip = toEngineRange(start.ip);

const totals = Object.fromEntries(variants.map((v) => [v, { loss: 0, big: 0, agree: 0, n: 0, seconds: 0 }]));
for (const id of boards) {
  const board = BOARDS[id];
  const ref = solveTexas({ board, pot: start.pot, stack: start.stack, oopRange: toTexasRange(start.oop), ipRange: toTexasRange(start.ip), tree: FLOP_TREE }, { label: `srp_btn_bb-${id}` });
  console.log(`\n${id}: reference ${ref.exploitability}% from equilibrium`);
  const nodeIds = arg('nodes', FLOP_NODES.map((n) => n.id).join(',')).split(',');
  for (const spot of FLOP_NODES.filter((n) => nodeIds.includes(n.id))) {
    const line = lineInBB(spot.line, start.pot);
    const refPoint = texasLine(ref.root, line);
    const refStart = refPoint.node.player === 1 ? oop : ip;
    const cells = [];
    for (const v of variants) {
      const started = Date.now();
      const engine = solveEngine({ board, pot: start.pot, stack: start.stack, oop, ip, line, detail: 'full', ...variantOf(v) });
      const r = compareNode({ ref: refPoint, engine, refStart, pot: engine.node.pot, stackTo: start.stack });
      if (r.offPath) {
        cells.push(`${v} (off path)`);
        continue;
      }
      const t = totals[v];
      t.loss += r.lossPct;
      t.big += r.bigPct;
      t.agree += r.agreePct;
      t.seconds += (Date.now() - started) / 1000;
      t.n++;
      cells.push(`${v} ${r.lossPct.toFixed(2)}`);
      console.log(`    ${spot.label} / ${v}: loss ${r.lossPct.toFixed(2)}% pot, big ${r.bigPct.toFixed(0)}%, agree ${r.agreePct.toFixed(0)}%, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    console.log(`  ${spot.label.padEnd(18)} loss % pot: ${cells.join(' | ')}`);
  }
}
console.log('\nAverage over decision points:');
for (const v of variants) {
  const t = totals[v];
  console.log(`  ${v.padEnd(13)} loss ${(t.loss / t.n).toFixed(2)}% pot  big ${(t.big / t.n).toFixed(1)}%  agree ${(t.agree / t.n).toFixed(0)}%  ${(t.seconds / t.n).toFixed(1)} s per solve`);
}
