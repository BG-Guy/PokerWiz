// Scoring the engine against the reference at one decision point. For every hand the acting player can hold
// there (weighted by how often it gets there in the reference solve):
//   loss     the reference's value of its best action minus the reference's value of the engine's mix: what
//            following the engine costs against a perfect opponent, as a share of the pot
//   agree    the engine's main play is one the reference makes at least 30% of the time with that hand
// plus each action's overall frequency in both solves, and the reference's own loss (its convergence noise).
import { cardId, handIndex } from '../../src/gto/cards.js';
import { parseAction } from './texas.mjs';

const handOf = (combo) => handIndex(cardId(combo.slice(0, 2)), cardId(combo.slice(2, 4)));

// Each engine action -> the reference action it is (same kind; bets and raises to the closest size, all in to
// the reference's biggest raise or bet when it reaches the stack).
function mapActions(engineActions, refActions, stackTo) {
  const ref = refActions.map((text) => parseAction(text));
  return engineActions.map((a) => {
    if (a.type === 'fold' || a.type === 'check' || a.type === 'call') return ref.findIndex((r) => r.type === a.type);
    const aggressive = ref.map((r, i) => ({ ...r, i })).filter((r) => r.type === 'bet' || r.type === 'raise');
    if (!aggressive.length) return -1;
    const target = a.type === 'allin' ? stackTo : a.to;
    return aggressive.reduce((best, r) => (Math.abs(r.to - target) < Math.abs(best.to - target) ? r : best)).i;
  });
}

// ref: { node, steps } from texasLine; engine: { solution, node, player } from solveEngine.
// refStart: the reference player's starting weights by hand index (the range at the top of the street).
export function compareNode({ ref, engine, refStart, pot, stackTo }) {
  const refNode = ref.node;
  const refStrategy = refNode.strategy.strategy;
  const refEvs = refNode.strategy.evs;
  if (!refEvs) throw new Error('The reference has no action values: rebuild TexasSolver with texassolver-ev.patch');
  const A = refNode.actions.length;

  // How often the opponent's range takes the line to here in the reference (a spot it hardly ever reaches isn't
  // converged in the reference: flagged offPath and left out of averages).
  let lineShare = 1;
  for (const { node, index } of ref.steps) {
    if (node.player === refNode.player) continue;
    const combos = Object.entries(node.strategy.strategy);
    const taken = combos.reduce((s, [, f]) => s + f[index], 0) / Math.max(1, combos.length);
    lineShare *= taken;
  }

  // How often each hand of the acting player reaches this point in the reference: start weight x its own
  // earlier actions on the line.
  const reach = new Map();
  for (const combo of Object.keys(refStrategy)) reach.set(combo, refStart[handOf(combo)] ?? 0);
  for (const { node, index } of ref.steps) {
    if (node.player !== refNode.player) continue;
    for (const combo of reach.keys()) reach.set(combo, reach.get(combo) * (node.strategy.strategy[combo]?.[index] ?? 0));
  }

  const { solution, node: engNode, player } = engine;
  const list = solution.lists[player];
  const n = list.count;
  const engStrategy = solution.strategy(engNode);
  const map = mapActions(engNode.actions, refNode.actions, stackTo);

  let weight = 0;
  let loss = 0;
  let refLoss = 0;
  let agree = 0;
  let big = 0;
  const refFreq = new Array(A).fill(0);
  const engFreq = new Array(A).fill(0);
  const worst = [];
  for (const [combo, w] of reach) {
    if (!(w > 1e-9)) continue;
    const k = list.position[handOf(combo)];
    if (k < 0) continue; // the engine dropped this hand (too light): not scored
    const evs = refEvs[combo];
    const best = Math.max(...evs);
    const mine = new Array(A).fill(0);
    engNode.actions.forEach((_, a) => {
      if (map[a] >= 0) mine[map[a]] += engStrategy[a * n + k];
    });
    const mineValue = mine.reduce((sum, f, i) => sum + f * evs[i], 0);
    const refValue = refStrategy[combo].reduce((sum, f, i) => sum + f * evs[i], 0);
    const handLoss = (best - mineValue) / pot;
    loss += w * handLoss;
    refLoss += w * ((best - refValue) / pot);
    if (handLoss > 0.05) big += w;
    const main = mine.indexOf(Math.max(...mine));
    if (refStrategy[combo][main] >= 0.3 || evs[main] >= best - 0.01 * pot) agree += w;
    for (let i = 0; i < A; i++) {
      refFreq[i] += w * refStrategy[combo][i];
      engFreq[i] += w * mine[i];
    }
    weight += w;
    worst.push({ combo, loss: handLoss, engine: mine.map((f) => Math.round(f * 100)), reference: refStrategy[combo].map((f) => Math.round(f * 100)), evs: evs.map((v) => Math.round(v * 100) / 100) });
  }
  worst.sort((a, b) => b.loss - a.loss);
  return {
    actions: refNode.actions,
    offPath: lineShare < 0.03,
    lineShare,
    hands: reach.size,
    lossPct: (100 * loss) / weight,
    refLossPct: (100 * refLoss) / weight,
    bigPct: (100 * big) / weight,
    agreePct: (100 * agree) / weight,
    refFreq: refFreq.map((f) => Math.round((1000 * f) / weight) / 10),
    engFreq: engFreq.map((f) => Math.round((1000 * f) / weight) / 10),
    worst: worst.slice(0, 8),
  };
}
