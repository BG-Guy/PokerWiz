// TexasSolver (github.com/bupticybee/TexasSolver, console branch, AGPL-3.0) as the reference: writes its input
// file for a spot, runs it (results are cached in work/ by the input's hash), and reads its JSON back.
// The local build needs the EV patch in texassolver-ev.patch (each action's value per hand); see README.md.
//
// Units are big blinds. TexasSolver's players: 1 = out of position (acts first), 0 = in position.
// Its actions: "CHECK", "CALL", "FOLD", "BET x" (x = the bet), "RAISE x" (x = raise to, this street's total);
// an all in is a bet or raise to the whole stack.
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORK = join(HERE, 'work');
const INSTALL = process.env.TEXAS_SOLVER ?? join(HERE, 'texassolver', 'install');
const STREETS = ['flop', 'turn', 'river'];

// tree: { flop|turn|river: { oop: { bet: [pct], raise: [pct], donk: [pct], allin }, ip: {...} } }, allinThreshold
function configText({ board, pot, stack, oopRange, ipRange, tree, allinThreshold = 0.67, accuracy = 0.3, maxIterations = 400, threads = 10, dumpRounds = 1 }) {
  const lines = [`set_pot ${pot}`, `set_effective_stack ${stack}`, `set_board ${board.join(',')}`, `set_range_ip ${ipRange}`, `set_range_oop ${oopRange}`];
  for (const street of STREETS) {
    for (const side of ['oop', 'ip']) {
      const s = tree[street]?.[side];
      if (!s) continue;
      if (s.bet?.length) lines.push(`set_bet_sizes ${side},${street},bet,${s.bet.join(',')}`);
      if (s.raise?.length) lines.push(`set_bet_sizes ${side},${street},raise,${s.raise.join(',')}`);
      if (s.donk?.length) lines.push(`set_bet_sizes ${side},${street},donk,${s.donk.join(',')}`);
      if (s.allin) lines.push(`set_bet_sizes ${side},${street},allin`);
    }
  }
  lines.push(`set_allin_threshold ${allinThreshold}`, 'build_tree', `set_thread_num ${threads}`, `set_accuracy ${accuracy}`, `set_max_iteration ${maxIterations}`);
  lines.push('set_print_interval 10', 'set_use_isomorphism 1', 'start_solve', `set_dump_rounds ${dumpRounds}`);
  return lines.join('\n');
}

// Where a spot's files live: named by the input's hash (the thread count is left out: it doesn't change the answer).
function filesFor(spec, label) {
  mkdirSync(WORK, { recursive: true });
  const text = configText(spec);
  const hash = createHash('sha1').update(text.replace(/^set_thread_num .*$/m, '')).digest('hex').slice(0, 12);
  return { text, base: join(WORK, `ts-${label}-${hash}`) };
}

// What the solve's log says: { seconds, exploitability (% of the pot), iterations }.
function readLog(base, started) {
  const log = readFileSync(`${base}.log`, 'utf8');
  const exploit = [...log.matchAll(/Total exploitability ([\d.]+) precent/g)].map((m) => Number(m[1]));
  const meta = { seconds: (Date.now() - started) / 1000, exploitability: exploit.at(-1) ?? null, iterations: [...log.matchAll(/Iter: (\d+)/g)].map((m) => Number(m[1])).at(-1) ?? null };
  writeFileSync(`${base}.meta.json`, JSON.stringify(meta));
}

function prepare(spec, label) {
  const { text, base } = filesFor(spec, label);
  if (!existsSync(join(INSTALL, 'console_solver'))) throw new Error(`TexasSolver isn't built: no console_solver in ${INSTALL} (see README.md)`);
  writeFileSync(`${base}.txt`, `${text}\ndump_result ${base}.json\n`);
  return base;
}
const args = (base) => ['-i', `${base}.txt`, '-r', join(INSTALL, 'resources')];
// A cached result (its summary is rebuilt from the log if the run that made it didn't get to write it).
function load(base) {
  if (!existsSync(`${base}.meta.json`)) readLog(base, Date.now());
  return { root: JSON.parse(readFileSync(`${base}.json`, 'utf8')), ...JSON.parse(readFileSync(`${base}.meta.json`, 'utf8')) };
}
export const isSolved = (spec, label) => existsSync(`${filesFor(spec, label).base}.json`);

// Solve a spot (or load the cached result). Returns { root (the JSON tree), exploitability (% of the pot), seconds }.
// The solver's progress goes straight to the .log file (watch it with tail -f while it runs).
export function solveTexas(spec, { label = 'spot' } = {}) {
  const { base } = filesFor(spec, label);
  if (!existsSync(`${base}.json`)) {
    prepare(spec, label);
    const started = Date.now();
    const out = openSync(`${base}.log`, 'w');
    execFileSync(join(INSTALL, 'console_solver'), args(base), { cwd: INSTALL, stdio: ['ignore', out, out] });
    closeSync(out);
    readLog(base, started);
  }
  return load(base);
}

// The same, without waiting (several solves at once): resolves when the result is cached.
export function solveTexasAsync(spec, { label = 'spot' } = {}) {
  const { base } = filesFor(spec, label);
  if (existsSync(`${base}.json`)) return Promise.resolve(base);
  prepare(spec, label);
  const started = Date.now();
  const out = openSync(`${base}.log`, 'w');
  return new Promise((resolve, reject) => {
    const child = spawn(join(INSTALL, 'console_solver'), args(base), { cwd: INSTALL, stdio: ['ignore', out, out] });
    child.on('exit', (code) => {
      closeSync(out);
      if (code !== 0) return reject(new Error(`TexasSolver exited with ${code} (see ${base}.log)`));
      readLog(base, started);
      resolve(base);
    });
  });
}

// "BET 1.815000" -> { type: 'bet', to: 1.815 }. All in (to = the whole stack) is told apart by the caller.
export function parseAction(text) {
  const [word, amount] = text.split(' ');
  const type = word.toLowerCase();
  return amount === undefined ? { type } : { type, to: Number(amount) };
}

// Follow a line through the solved tree. line: [{ type, to? }] (solver-neutral; a bet or raise goes to the
// closest size of the same kind). Returns { node, steps: [{ node, index }] } (the node reached, and each
// decision on the way with the action taken), or throws if the line isn't in the tree.
export function texasLine(root, line) {
  let node = root;
  const steps = [];
  for (const step of line) {
    const options = (node.actions ?? []).map((text, index) => ({ text, index, ...parseAction(text) }));
    const candidates = options.filter((a) => a.type === step.type);
    if (!candidates.length) throw new Error(`No ${step.type} at this point (actions: ${node.actions?.join(', ')})`);
    const pick = step.to === undefined ? candidates[0] : candidates.reduce((best, a) => (Math.abs(a.to - step.to) < Math.abs(best.to - step.to) ? a : best));
    steps.push({ node, index: pick.index });
    node = node.childrens?.[pick.text];
    if (!node) throw new Error(`The solve didn't dump past ${pick.text}`);
  }
  return { node, steps };
}
