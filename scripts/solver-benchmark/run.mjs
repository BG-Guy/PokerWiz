// Coach vs solver benchmark (see README.md).
//   node run.mjs                 solve what's missing (cached in work/), score the coach, print the summary
//   node run.mjs --boards K72    only some boards
//   COACH_DIR=../other-copy node run.mjs --label old    score another copy of the app on the same spots
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { coachRanges, coachDecision, UNIT, category } from './coach.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const BIN = path.join(HERE, 'target', 'release', 'solver-benchmark');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SAMPLE = Number(arg('sample', 24));
const LABEL = arg('label', 'coach');

// Board id -> flop, turn, river. Five textures: dry high, wet middle, ace high, low connected, two-tone.
const BOARDS = {
  K72: ['Ks7d2c', '4h', '9s'],
  T96: ['Td9d6h', '2c', 'Ks'],
  A83: ['Ah8c3d', 'Jc', '5h'],
  765: ['7c6c5d', 'Kh', '2s'],
  Q94: ['Qs9h4s', '8d', '2c'],
};
const boards = (arg('boards', Object.keys(BOARDS).join(','))).split(',');
fs.mkdirSync(WORK, { recursive: true });
const file = (name) => path.join(WORK, name);

// ----- Solving (cached) -----

function solve(name, spec) {
  if (fs.existsSync(file(`out_${name}.json`))) return JSON.parse(fs.readFileSync(file(`out_${name}.json`)));
  fs.writeFileSync(file(`spec_${name}.json`), JSON.stringify(spec));
  const started = Date.now();
  const out = execFileSync(BIN, [file(`spec_${name}.json`)], { maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'inherit'] });
  fs.writeFileSync(file(`out_${name}.json`), out);
  console.error(`${name}: solved in ${Math.round((Date.now() - started) / 1000)}s`);
  return JSON.parse(out);
}

const X = ['check', 'bet:0.33', 'call', 'deal']; // flop: BB checks, BTN bets 33%, BB calls, turn comes
const XX = [...X, 'check', 'check', 'deal']; // turn checks through, river comes

// Full game from the flop. Sizes are trimmed to fit in memory (~5 GB): flop 33%/75% with raises, turn and
// river 75% with all-in raises. Only the flop spots are scored from this tree.
const ranges = await coachRanges();
function flopSolve(id) {
  const [flop, turn, river] = BOARDS[id];
  return solve(id, {
    flop, turn, river, oop_range: ranges.oop, ip_range: ranges.ip, pot: 110, stack: 1950,
    flop_sizes: '33%, 75%', flop_raise: '3x', turn_sizes: '75%', turn_raise: 'a', river_sizes: '75%', river_raise: 'a', raise: 'a',
    iterations: 400,
    nodes: [
      { name: 'flop_bb_first', path: [] },
      { name: 'flop_btn_vs_check', path: ['check'] },
      { name: 'flop_bb_vs_33', path: ['check', 'bet:0.33'] },
      { name: 'flop_bb_vs_75', path: ['check', 'bet:0.75'] },
      { name: 'turn_start', path: X },
      { name: 'river_start', path: XX },
    ],
  });
}

// Later streets re-solved on their own from the exact ranges that reach them, with more sizes.
function laterSolve(id, full, street) {
  const [flop, turn, river] = BOARDS[id];
  const start = full.nodes.find((n) => n.name === `${street}_start` || n.name === `${street}_bb_first`);
  const S = street === 'turn' ? '125' : '150';
  return solve(`${id}${street === 'turn' ? 'T' : 'R'}`, {
    mode: street, flop, turn, river, oop_range: start.ranges[0], ip_range: start.ranges[1],
    pot: start.pot, stack: 1950 - Math.max(...start.bets),
    flop_sizes: '50%', turn_sizes: '33%, 75%, 125%', turn_raise: '2.5x, a', river_sizes: '33%, 75%, 150%', river_raise: '2.5x, a', raise: 'a',
    iterations: street === 'turn' ? 500 : 1000,
    prefix_line: start.line,
    nodes: [
      { name: `${street}_bb_first`, path: [] },
      { name: `${street}_btn_vs_check`, path: ['check'] },
      { name: `${street}_btn_vs_lead`, path: ['bet:0.75'] },
      { name: `${street}_bb_vs_33`, path: ['check', 'bet:0.33'] },
      { name: `${street}_bb_vs_75`, path: ['check', 'bet:0.75'] },
      { name: `${street}_bb_vs_${S}`, path: ['check', `bet:${Number(S) / 100}`] },
    ],
  });
}

// ----- Scoring -----

// The solver action matching the coach's best play (closest size for bets and raises).
function matchAction(best, actions) {
  if (best.kind !== 'raise') return actions.findIndex((a) => a.kind === best.kind);
  let pick = -1;
  let gap = Infinity;
  actions.forEach((a, i) => {
    if (category(a.kind) !== 'aggressive') return;
    const d = best.type === 'allin' ? (a.kind === 'allin' ? 0 : 1e9) : Math.abs(a.amount - best.to * UNIT);
    if (d < gap) [gap, pick] = [d, i];
  });
  return pick;
}

async function score(out, flop, prefix = []) {
  const rows = [];
  for (const node of out.nodes) {
    if (node.error || node.name.endsWith('_start')) continue;
    const maxWeight = Math.max(...node.hands.map((h) => h.weight));
    const reached = node.hands.filter((h) => h.weight >= 0.25 * maxWeight);
    // Spots the solver's strategy barely reaches aren't converged: its favorite action there often isn't even
    // its best-valued one. Skip them.
    const unconverged = reached.filter((h) => Math.max(...h.ev) - h.ev[h.strategy.indexOf(Math.max(...h.strategy))] > 0.02 * node.pot).length;
    if (unconverged > 0.03 * reached.length) {
      console.error(`  ${node.board} ${node.name}: skipped (rarely reached)`);
      continue;
    }
    // A spread of hands across the range, weakest to strongest.
    const sorted = reached.sort((a, b) => Math.max(...a.ev) - Math.max(...b.ev));
    const step = Math.max(1, sorted.length / SAMPLE);
    for (let k = 0; k < Math.min(SAMPLE, sorted.length); k++) {
      const hand = sorted[Math.floor(k * step)];
      const d = await coachDecision({ flop, line: [...prefix, ...node.line], heroPlayer: node.player, heroCards: hand.cards.match(/../g) });
      const coachKind = category(d.best.kind === 'raise' ? 'bet' : d.best.kind);
      const bestEV = Math.max(...hand.ev);
      const kindEV = Math.max(...node.actions.map((a, i) => (category(a.kind) === coachKind ? hand.ev[i] : -Infinity)));
      const kindFreq = node.actions.reduce((sum, a, i) => sum + (category(a.kind) === coachKind ? hand.strategy[i] : 0), 0);
      const mainKind = category(node.actions[hand.strategy.indexOf(Math.max(...hand.strategy))].kind);
      const exact = matchAction(d.best, node.actions);
      rows.push({
        board: node.board,
        spot: node.name,
        cards: hand.cards,
        hand: d.heroHand.text,
        coach: d.best.label,
        solver: node.actions.map((a, i) => `${a.kind}${a.amount ? ' ' + a.amount / UNIT : ''} ${Math.round(hand.strategy[i] * 100)}%`).join(', '),
        agrees: coachKind === mainKind || kindFreq >= 0.3,
        lossPct: (100 * (bestEV - kindEV)) / node.pot,
        exactLossPct: exact >= 0 ? (100 * (bestEV - hand.ev[exact])) / node.pot : null,
      });
    }
  }
  return rows;
}

function summarize(rows, title) {
  const groups = new Map();
  for (const r of rows) groups.set(r.spot, [...(groups.get(r.spot) ?? []), r]);
  const line = (name, list) => {
    const n = list.length;
    const agree = list.filter((r) => r.agrees).length / n;
    const loss = list.reduce((s, r) => s + r.lossPct, 0) / n;
    const big = list.filter((r) => r.lossPct > 5).length / n;
    return `${name.padEnd(22)} ${String(n).padStart(4)} ${`${Math.round(agree * 100)}%`.padStart(6)} ${loss.toFixed(2).padStart(9)} ${`${Math.round(big * 100)}%`.padStart(9)}`;
  };
  console.log(`\n${title}\n${'spot'.padEnd(22)} ${'n'.padStart(4)} ${'agree'.padStart(6)} ${'loss%pot'.padStart(9)} ${'big>5%'.padStart(9)}`);
  for (const [name, list] of groups) console.log(line(name, list));
  console.log(line('ALL', rows));
}

const all = [];
for (const id of boards) {
  const flop = BOARDS[id][0].match(/../g);
  const full = flopSolve(id);
  const turn = laterSolve(id, full, 'turn');
  const river = laterSolve(id, full, 'river');
  const startOf = (street) => full.nodes.find((n) => n.name === `${street}_start` || n.name === `${street}_bb_first`).line;
  const turnPrefix = startOf('turn');
  const riverPrefix = startOf('river');
  // Only the flop is scored from the full tree (its turn and river sizes are trimmed).
  const flopOnly = { ...full, nodes: full.nodes.filter((n) => n.name.startsWith('flop_')) };
  all.push(...(await score(flopOnly, flop)), ...(await score(turn, flop, turnPrefix)), ...(await score(river, flop, riverPrefix)));
  console.error(`${id}: scored`);
}
fs.writeFileSync(file(`results_${LABEL}.json`), JSON.stringify(all, null, 1));
summarize(all, `${LABEL}: ${boards.join(', ')}`);
