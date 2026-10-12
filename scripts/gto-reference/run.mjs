// Engine vs TexasSolver on common spots (see README.md).
//   node scripts/gto-reference/run.mjs                              every flop, both budgets
//   node scripts/gto-reference/run.mjs --boards K72,T96 --detail full
//   node scripts/gto-reference/run.mjs --street turn                turn spots (river: --street river)
// Prints a table per decision point and writes work/report-<label>.json.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flopStart, toTexasRange, toEngineRange } from './ranges.mjs';
import { solveTexas, texasLine, WORK } from './texas.mjs';
import { solveEngine } from './engine.mjs';
import { compareNode } from './compare.mjs';
import { rangesAfter, toTexasCombos, roundedLike } from './streets.mjs';
import { BOARDS, FLOP_TREE, FLOP_NODES, TURN_SPOTS, TURN_TREE, TURN_NODES, RIVER_SPOTS, RIVER_TREE, RIVER_NODES, lineInBB, afterLine } from './spots.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const street = arg('street', 'flop');
const details = arg('detail', 'full,fast').split(',');
const lineId = arg('line', 'srp_btn_bb');
const label = arg('label', `${lineId}-${street}`);

const start = await flopStart(lineId);
console.log(`${lineId}: pot ${start.pot} bb, stacks ${start.stack} bb${start.lostPreflop ? ` (preflop: ${start.lostPreflop})` : ''}`);

// ----- The spots of one street: board, pot, stack, both ranges (engine and reference), the reference solve -----
const flopSpot = (id) => {
  const oop = toEngineRange(start.oop);
  const ip = toEngineRange(start.ip);
  const spec = { board: BOARDS[id], pot: start.pot, stack: start.stack, oopRange: toTexasRange(start.oop), ipRange: toTexasRange(start.ip), tree: FLOP_TREE };
  return { id, board: BOARDS[id], pot: start.pot, stack: start.stack, oop, ip, spec, label: `${lineId}-${id}`, nodes: FLOP_NODES };
};
// A spot on the next street: the line on this one, then a card.
function nextSpot(prev, carry, tree, nodes, suffix) {
  const ref = solveTexas(prev.spec, { label: prev.label });
  const lineBB = lineInBB(carry.line, prev.pot);
  const reached = rangesAfter(texasLine(ref.root, lineBB), { oop: prev.oop, ip: prev.ip });
  const board = [...prev.board, carry.card];
  const { pot, stack } = afterLine(lineBB, prev.pot, prev.stack);
  const spec = { board, pot, stack, oopRange: toTexasCombos(reached.oop, board), ipRange: toTexasCombos(reached.ip, board), tree };
  return { id: prev.id, board, pot, stack, oop: roundedLike(reached.oop, board), ip: roundedLike(reached.ip, board), spec, label: `${prev.label}-${suffix}${carry.card}`, nodes };
}
function spotsFor(name) {
  if (name === 'flop') return arg('boards', Object.keys(BOARDS).join(',')).split(',').map(flopSpot);
  const ids = arg('boards', Object.keys(name === 'turn' ? TURN_SPOTS : RIVER_SPOTS).join(',')).split(',');
  return ids.map((id) => {
    const turn = nextSpot(flopSpot(id), TURN_SPOTS[id], TURN_TREE, TURN_NODES, 't');
    return name === 'turn' ? turn : nextSpot(turn, RIVER_SPOTS[id], RIVER_TREE, RIVER_NODES, 'r');
  });
}

// ----- Compare at every decision point -----
const report = [];
for (const spot of spotsFor(street)) {
  const ref = solveTexas(spot.spec, { label: spot.label });
  console.log(`\n${spot.id} ${street} (${spot.board.join(' ')}), pot ${spot.pot} bb: reference ${ref.exploitability}% of the pot from equilibrium, ${Math.round(ref.seconds)}s`);
  for (const point of spot.nodes) {
    const line = lineInBB(point.line, spot.pot);
    const refPoint = texasLine(ref.root, line);
    // The acting player's range at the top of the street (TexasSolver's player 1 is out of position).
    const refStart = refPoint.node.player === 1 ? spot.oop : spot.ip;
    for (const detail of details) {
      const started = Date.now();
      const engine = solveEngine({ board: spot.board, pot: spot.pot, stack: spot.stack, oop: spot.oop, ip: spot.ip, line, detail });
      const result = compareNode({ ref: refPoint, engine, refStart, pot: engine.node.pot, stackTo: spot.stack });
      report.push({ board: spot.id, street, node: point.id, detail, seconds: (Date.now() - started) / 1000, iterations: engine.solution.iterations, ...result });
      const freq = result.actions.map((a, i) => `${a.replace(/\.0+$/, '').replace(/(\.\d)\d+/, '$1')} ${result.engFreq[i]}/${result.refFreq[i]}`).join('  ');
      console.log(
        `  ${point.label.padEnd(18)} ${detail.padEnd(4)} loss ${result.lossPct.toFixed(2).padStart(5)}% pot (ref ${result.refLossPct.toFixed(2)})  big ${result.bigPct.toFixed(0).padStart(2)}%  agree ${result.agreePct.toFixed(0).padStart(3)}%  | ${freq}${result.offPath ? '  (off path: not averaged)' : ''}`
      );
    }
  }
}
writeFileSync(join(WORK, `report-${label}.json`), JSON.stringify(report, null, 1));

// Summary: average over the decision points the reference really reaches, per budget.
for (const detail of details) {
  const rows = report.filter((r) => r.detail === detail && !r.offPath);
  const avg = (key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
  console.log(`\n${detail}: loss ${avg('lossPct').toFixed(2)}% of the pot, big mistakes ${avg('bigPct').toFixed(1)}%, agreement ${avg('agreePct').toFixed(0)}% over ${rows.length} decision points`);
}
