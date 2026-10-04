// One postflop street of a real hand: the players' ranges when it starts, the actions so far, and the solve
// behind the advice. The solve is reused while the hand stays inside its tree; when someone does something it
// doesn't contain (a bet size it didn't have), the street is solved again with that action in it.
// When the whole street is known in advance (reviewing a finished hand), it's solved once with every real
// action in it (setPlan), which also gives the exact value of each of them.
import { solvePostflop } from './solver.js';
import { DECISION } from './tree.js';

const close = (a, b, pot) => Math.abs(a - b) <= Math.max(0.05, 0.015 * pot);

// Follow a path of real actions down a solved tree. Returns the node reached and the action index taken at
// each step, or null if the tree doesn't contain the path.
function follow(root, path) {
  let node = root;
  const steps = [];
  for (const real of path) {
    if (node.type !== DECISION || node.player !== real.player) return null;
    const index = node.actions.findIndex((a) => {
      if (real.type === 'allin') return a.type === 'allin';
      if (real.type === 'bet' || real.type === 'raise') return (a.type === 'bet' || a.type === 'raise') && close(a.to, real.to, node.pot);
      return a.type === real.type;
    });
    if (index < 0) return null;
    steps.push({ node, index });
    node = node.children[index];
  }
  return { node, steps };
}

// spec: { board (card ids), ranges: [Float32Array(1326)] in postflop order, pot (bb), stacks (bb behind),
//         include: [[hand indices]] per player (known hands that need answers), detail, seed }
export function createStreet(spec) {
  const path = [];
  let plan = null;
  let solution = null;

  // A solve containing `wanted` (preferring the plan, so one solve covers the whole street).
  function solutionFor(wanted) {
    if (solution && follow(solution.tree.root, wanted)) return solution;
    const onPlan = plan && wanted.every((a, i) => plan[i] && plan[i].player === a.player && plan[i].type === a.type);
    solution = solvePostflop({ ...spec, path: onPlan ? plan : wanted });
    return solution;
  }

  // Range weights after the path, from the start ranges and the solve's strategy at each step.
  function rangesAfter(sol, steps) {
    const ranges = spec.ranges.map((r) => Float32Array.from(r));
    for (const { node, index } of steps) {
      const p = node.player;
      const strategy = sol.strategy(node);
      const list = sol.lists[p];
      const n = list.count;
      const inSolve = new Float32Array(1326);
      for (let k = 0; k < n; k++) inSolve[list.hands[k]] = strategy[index * n + k];
      const out = ranges[p];
      for (let h = 0; h < 1326; h++) out[h] *= inSolve[h];
    }
    return ranges;
  }

  return {
    spec,
    path,
    // The whole street's real actions, when known up front.
    setPlan(actions) {
      plan = actions;
    },
    // A real action: { player (index in postflop order), type, to (bb street total) }.
    apply(action) {
      path.push(action);
    },
    // GTO for player p (to act now) holding `hand` (1326 index): { actions, pot, toCall, strategy, values,
    // iterations, elapsed }. values (bb, relative to folding here) are only there for spots on the solved line.
    advice(p, hand) {
      const sol = solutionFor(path);
      const { node } = follow(sol.tree.root, path);
      if (node.type !== DECISION || node.player !== p) throw new Error("It is not this player's turn in the solved game.");
      const h = sol.handPosition(p, hand);
      if (h < 0) throw new Error('This hand is not in the solve.');
      const n = sol.lists[p].count;
      const strategy = sol.strategy(node);
      return {
        actions: node.actions,
        pot: node.pot,
        toCall: node.toCall,
        strategy: node.actions.map((_, a) => strategy[a * n + h]),
        values: node.actionValues ? sol.actionValues(node, h) : null,
        iterations: sol.iterations,
        elapsed: sol.elapsed,
      };
    },
    // Everyone's ranges right now (1326 weights each, postflop order).
    ranges() {
      if (!path.length) return spec.ranges;
      const sol = solutionFor(path);
      return rangesAfter(sol, follow(sol.tree.root, path).steps);
    },
  };
}
