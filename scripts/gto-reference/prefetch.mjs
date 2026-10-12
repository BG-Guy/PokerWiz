// Solves the reference for several flops at once (each with its share of the cores), so run.mjs and
// study.mjs only find cached results.
//   node scripts/gto-reference/prefetch.mjs --boards T96,A83 --parallel 2
import { cpus } from 'node:os';
import { flopStart, toTexasRange } from './ranges.mjs';
import { solveTexasAsync, isSolved } from './texas.mjs';
import { BOARDS, FLOP_TREE } from './spots.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const lineId = arg('line', 'srp_btn_bb');
const boards = arg('boards', Object.keys(BOARDS).join(',')).split(',');
const parallel = Number(arg('parallel', 2));
const threads = Math.max(1, Math.floor(cpus().length / parallel));

const start = await flopStart(lineId);
const specOf = (id) => ({ board: BOARDS[id], pot: start.pot, stack: start.stack, oopRange: toTexasRange(start.oop), ipRange: toTexasRange(start.ip), tree: FLOP_TREE, threads });
const queue = boards.filter((id) => !isSolved(specOf(id), `${lineId}-${id}`));
console.log(`${lineId}: ${queue.length} to solve (${boards.length - queue.length} cached), ${parallel} at a time, ${threads} threads each`);

async function worker() {
  while (queue.length) {
    const id = queue.shift();
    const started = Date.now();
    console.log(`${id}: solving`);
    await solveTexasAsync(specOf(id), { label: `${lineId}-${id}` });
    console.log(`${id}: done in ${Math.round((Date.now() - started) / 60000)} min`);
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
