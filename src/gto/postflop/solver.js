// Postflop GTO solver for heads-up and multiway pots (written for PokerWiz, in plain JavaScript so it runs in
// a web worker). Solves from the start of the current street to the end of the hand with Discounted CFR
// (alpha 1.5, beta 0, gamma 2), every hand of every player at once, then reads each hand's strategy and the
// value of each action.
//
// Keeping it fast enough for a phone, the way published solvers and poker AIs do (Libratus, Pluribus):
//   - one street at a time: the hand is re-solved when the next card comes, from the ranges the players
//     reached it with (each action narrows the actor's range by how often each hand takes it)
//   - a few bet sizes (sizes.js), plus the real sizes used in the hand (tree.js)
//   - later cards are sampled: a handful of turns, a few rivers per turn (the same sample everywhere in the
//     tree, so every line is valued against the same runouts)
//   - multiway pots bet on two streets at most per solve and check the rest down
import { buildHandList, sameHandIndex, handsByCard } from './hands.js';
import { buildPostflopTree, DECISION, CHANCE, FOLD, SHOWDOWN } from './tree.js';
import { strengthsOn, strengthOrder, createLeafEvaluator, cardSums, massAgainst } from './showdown.js';
import { createRandom } from '../../coach/random.js';

const ALPHA = 1.5;
const GAMMA = 2;

// Per kind of solve: how many turn and river cards are sampled, how many streets have betting (counting the
// one being solved; after that the hand is checked down), and how many iterations / ms it gets.
const BUDGETS = {
  2: {
    full: { flop: { turns: 8, rivers: 4, betting: 2 }, turn: { rivers: 12, betting: 2 }, iterations: 260, ms: 7000 },
    fast: { flop: { turns: 6, rivers: 4, betting: 2 }, turn: { rivers: 8, betting: 2 }, iterations: 150, ms: 2500 },
  },
  3: {
    full: { flop: { turns: 6, rivers: 4, betting: 1 }, turn: { rivers: 10, betting: 1 }, iterations: 400, ms: 7000 },
    fast: { flop: { turns: 5, rivers: 3, betting: 1 }, turn: { rivers: 6, betting: 1 }, iterations: 220, ms: 2500 },
  },
};

// input: {
//   board: card ids (3-5), ranges: [Float32Array(1326)] per player in postflop order (seat 0 acts first),
//   pot: chips in the middle at the start of the street, stacks: chips behind per player,
//   path: the street's real actions so far [{ player, type, to }],
//   include: [[hand indices] per player] hands that must be in the solve (known cards),
//   detail: 'full' | 'fast', seed, iterations?, ms?
// }
export function solvePostflop(input) {
  const P = input.ranges.length;
  const detail = input.detail ?? 'full';
  const plan = BUDGETS[Math.min(3, P)][detail];
  const street = { 3: plan.flop, 4: plan.turn, 5: { betting: 1 } }[input.board.length];
  const budget = { iterations: input.iterations ?? plan.iterations, ms: input.ms ?? plan.ms };
  const random = createRandom(input.seed ?? 1);
  const board = input.board;

  // ----- Players' hands -----
  // Hands below 0.2% of the heaviest barely move anyone's strategy but cost as much as any other: left out.
  const lists = input.ranges.map((weights, p) => buildHandList(weights, board, 2e-3, input.include?.[p] ?? []));
  if (lists.some((l) => l.count === 0)) throw new Error('A player has no possible hands on this board.');
  const same = lists.map((a) => lists.map((b) => (a === b ? null : sameHandIndex(a, b))));
  const byCard = lists.map((l) => handsByCard(l));
  const game = { lists, same };

  // ----- Sampled next cards (the same sample everywhere in the tree) -----
  const dealt = new Map();
  function deal(current) {
    const key = current.join(',');
    if (dealt.has(key)) return dealt.get(key);
    const used = new Set(current);
    const deck = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const want = current.length === 3 ? street.turns : street.rivers;
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const cards = deck.slice(0, Math.min(want, deck.length)).sort((a, b) => a - b);
    dealt.set(key, cards);
    return cards;
  }

  const tree = buildPostflopTree({ board, pot: input.pot, stacks: input.stacks, path: input.path ?? [], deal, detail, bettingStreets: street.betting });

  // ----- Showdown boards: every hand's strength on every 5-card runout in the tree -----
  const boards = new Map();
  function boardInfo(cards) {
    const key = cards.join(',');
    let info = boards.get(key);
    if (!info) {
      const strength = lists.map((l) => strengthsOn(l, cards));
      info = { strength, order: strength.map(strengthOrder) };
      boards.set(key, info);
    }
    return info;
  }
  (function prepare(node) {
    if (node.type === SHOWDOWN) node.info = boardInfo(node.board);
    if (node.children) node.children.forEach(prepare);
  })(tree.root);

  // ----- Per-decision storage -----
  for (const node of tree.decisions) {
    const n = lists[node.player].count;
    node.regrets = new Float32Array(node.actions.length * n);
    node.strategySum = new Float32Array(node.actions.length * n);
  }

  // Scratch buffers by depth in the tree (so nothing is allocated while solving).
  const maxHands = Math.max(...lists.map((l) => l.count));
  const maxActions = Math.max(1, ...tree.decisions.map((d) => d.actions.length));
  const depthBuffers = [];
  function buffersAt(depth) {
    if (!depthBuffers[depth]) {
      depthBuffers[depth] = {
        cfv: lists.map((l) => new Float64Array(l.count)),
        mask: lists.map((l) => new Float64Array(l.count)),
        live: lists.map((l) => new Int32Array(l.count)),
        values: new Float64Array(maxActions * maxHands),
        sigma: new Float64Array(maxActions * maxHands),
        rows: lists.map((l) => new Float64Array(l.count)),
      };
    }
    return depthBuffers[depth];
  }
  const evaluator = createLeafEvaluator(game);

  // Regret matching (current strategy) into `out`.
  function currentStrategy(node, out) {
    const A = node.actions.length;
    const n = lists[node.player].count;
    const { regrets } = node;
    for (let h = 0; h < n; h++) {
      let sum = 0;
      for (let a = 0; a < A; a++) {
        const r = regrets[a * n + h];
        if (r > 0) sum += r;
      }
      for (let a = 0; a < A; a++) {
        const r = regrets[a * n + h];
        out[a * n + h] = sum > 0 ? (r > 0 ? r / sum : 0) : 1 / A;
      }
    }
  }

  // Average strategy (what the solve recommends) into `out`.
  function averageStrategy(node, out = new Float64Array(node.actions.length * lists[node.player].count)) {
    const A = node.actions.length;
    const n = lists[node.player].count;
    currentStrategy(node, out);
    for (let h = 0; h < n; h++) {
      let sum = 0;
      for (let a = 0; a < A; a++) sum += node.strategySum[a * n + h];
      if (sum > 1e-12) for (let a = 0; a < A; a++) out[a * n + h] = node.strategySum[a * n + h] / sum;
    }
    return out;
  }

  // One pass of the tree. mode: 'train' (update), 'final' (average strategy; keep values on the real line),
  // 'br' (best response of brPlayer against everyone's average strategy).
  function walk(node, reach, depth, mode, iteration, brPlayer) {
    const buf = buffersAt(depth);
    const cfv = buf.cfv;
    if (node.type === FOLD) return evaluator.fold(node, reach, cfv);
    if (node.type === SHOWDOWN) return evaluator.showdown(node, reach, cfv, node.info);

    if (node.type === CHANCE) {
      // Average over the dealt cards; a hand holding the card can't see that branch (and blocks nobody there).
      for (let p = 0; p < P; p++) {
        cfv[p].fill(0);
        buf.live[p].fill(node.cards.length);
        for (const card of node.cards) for (const h of byCard[p][card]) buf.live[p][h]--;
      }
      const child = buffersAt(depth + 1).cfv;
      node.cards.forEach((card, c) => {
        for (let p = 0; p < P; p++) {
          buf.mask[p].set(reach[p]);
          for (const h of byCard[p][card]) buf.mask[p][h] = 0;
        }
        walk(node.children[c], buf.mask, depth + 1, mode, iteration, brPlayer);
        for (let p = 0; p < P; p++) {
          for (const h of byCard[p][card]) child[p][h] = 0;
          const out = cfv[p];
          const add = child[p];
          for (let h = 0; h < out.length; h++) out[h] += add[h];
        }
      });
      for (let p = 0; p < P; p++) {
        const out = cfv[p];
        const live = buf.live[p];
        for (let h = 0; h < out.length; h++) out[h] = live[h] > 0 ? out[h] / live[h] : 0;
      }
      return;
    }

    // Decision: everyone else's values add up over the actions; the actor's mix by the strategy.
    const p = node.player;
    const A = node.actions.length;
    const n = lists[p].count;
    const sigma = buf.sigma;
    if (mode === 'train') currentStrategy(node, sigma);
    else averageStrategy(node, sigma);
    if (mode === 'final' && node.onPath !== undefined) node.reachHere = reach.map((row) => Float64Array.from(row));
    const values = buf.values;
    const myReach = reach[p];
    const row = buf.rows[p];
    const childReach = reach.slice();
    for (let q = 0; q < P; q++) if (q !== p) cfv[q].fill(0);
    const child = buffersAt(depth + 1).cfv;
    const bestResponse = mode === 'br' && p === brPlayer;
    for (let a = 0; a < A; a++) {
      if (bestResponse) childReach[p] = myReach;
      else {
        for (let h = 0; h < n; h++) row[h] = myReach[h] * sigma[a * n + h];
        childReach[p] = row;
      }
      walk(node.children[a], childReach, depth + 1, mode, iteration, brPlayer);
      values.set(child[p], a * n);
      for (let q = 0; q < P; q++) {
        if (q === p) continue;
        const out = cfv[q];
        const add = child[q];
        for (let h = 0; h < out.length; h++) out[h] += add[h];
      }
    }
    const mine = cfv[p];
    for (let h = 0; h < n; h++) {
      let v = bestResponse ? -Infinity : 0;
      for (let a = 0; a < A; a++) v = bestResponse ? Math.max(v, values[a * n + h]) : v + sigma[a * n + h] * values[a * n + h];
      mine[h] = v;
    }
    if (mode === 'final' && node.onPath !== undefined) node.actionValues = Float64Array.from(values.subarray(0, A * n));
    if (mode !== 'train' || (brPlayer >= 0 && brPlayer !== p)) return;

    // Discounted CFR: past regrets shrink (positive by t^1.5 / (t^1.5 + 1), negative by half) before this
    // iteration's are added, and the running strategy total shrinks by (t / (t + 1))^2, so later (better)
    // iterations count more.
    const positive = iteration ** ALPHA / (iteration ** ALPHA + 1);
    const decay = (iteration / (iteration + 1)) ** GAMMA;
    const { regrets, strategySum } = node;
    for (let a = 0; a < A; a++) {
      const base = a * n;
      for (let h = 0; h < n; h++) {
        const old = regrets[base + h];
        regrets[base + h] = old * (old > 0 ? positive : 0.5) + values[base + h] - mine[h];
        strategySum[base + h] = strategySum[base + h] * decay + myReach[h] * sigma[base + h];
      }
    }
  }

  const startReach = () => lists.map((l) => Float64Array.from(l.weights));

  // ----- Solve -----
  const started = Date.now();
  let iteration = 0;
  // Heads-up: alternating updates (one player's regrets per pass) converge faster per pass than updating both.
  // Multiway: everyone at once, so each iteration costs one pass instead of three.
  const alternate = input.alternate ?? P === 2;
  while (iteration < budget.iterations) {
    iteration++;
    if (alternate) for (let p = 0; p < P; p++) walk(tree.root, startReach(), 0, 'train', iteration, p);
    else walk(tree.root, startReach(), 0, 'train', iteration, -1);
    if (iteration >= 30 && Date.now() - started > budget.ms) break;
  }
  walk(tree.root, startReach(), 0, 'final', iteration, -1);
  const elapsed = Date.now() - started;

  // ----- Reading the solution -----
  const pathNodes = [];
  (function collect(node) {
    if (node.type !== DECISION || node.onPath === undefined) return;
    pathNodes[node.onPath] = node;
    if (node.realIndex !== undefined) collect(node.children[node.realIndex]);
  })(tree.root);

  // Everyone else's reach that doesn't clash with each of p's hands, multiplied together.
  function opponentMass(node, p) {
    const n = lists[p].count;
    const out = new Float64Array(n).fill(1);
    const sums = new Float64Array(52);
    const mass = new Float64Array(n);
    for (let o = 0; o < P; o++) {
      if (o === p) continue;
      const total = cardSums(lists[o], node.reachHere[o], sums);
      massAgainst(lists[p], same[p][o], node.reachHere[o], total, sums, mass);
      for (let h = 0; h < n; h++) out[h] *= mass[h];
    }
    return out;
  }

  return {
    tree,
    lists,
    iterations: iteration,
    elapsed,
    // Decision points on the real line: pathNodes[i] is where the street's i-th real action was taken (the
    // last one is where the hand is now, if the street isn't over).
    pathNodes,
    // Where a hand (1326 index) sits in player p's list, or -1 if p can't hold it.
    handPosition: (p, hand) => lists[p].position[hand],
    // The recommended strategy at a node: Float64Array(actions x hands), action-major.
    strategy: (node) => averageStrategy(node),
    // Each action's value for the hand at position h of the node's player, in chips relative to folding here
    // (the pot already in counts as winnable: folding = 0). Only for nodes on the real line.
    actionValues(node, h) {
      const p = node.player;
      const n = lists[p].count;
      const mass = opponentMass(node, p)[h];
      if (!(mass > 1e-12)) return null;
      return node.actions.map((_, a) => node.actionValues[a * n + h] / mass + node.invested[p]);
    },
    // A player's range at a node on the real line, as 1326 weights (how likely each hand is to be here).
    rangeAt(node, p) {
      const out = new Float32Array(1326);
      const reach = node.reachHere[p];
      lists[p].hands.forEach((hand, k) => {
        out[hand] = reach[k];
      });
      return out;
    },
    // The actor's range after taking action a at a node on the real line.
    rangeAfter(node, a) {
      const p = node.player;
      const n = lists[p].count;
      const strategy = averageStrategy(node);
      const out = new Float32Array(1326);
      const reach = node.reachHere[p];
      lists[p].hands.forEach((hand, k) => {
        out[hand] = reach[k] * strategy[a * n + k];
      });
      return out;
    },
    // Heads-up only: how much a perfect counter-strategy would win, as a share of the starting pot (0 = solved).
    exploitability() {
      if (P !== 2) return null;
      let total = 0;
      for (let p = 0; p < 2; p++) {
        walk(tree.root, startReach(), 0, 'br', iteration, p);
        const values = buffersAt(0).cfv[p];
        const o = 1 - p;
        const w = lists[p].weights;
        const sums = new Float64Array(52);
        const oppTotal = cardSums(lists[o], lists[o].weights, sums);
        const mass = new Float64Array(lists[p].count);
        massAgainst(lists[p], same[p][o], lists[o].weights, oppTotal, sums, mass);
        let ev = 0;
        let norm = 0;
        for (let h = 0; h < lists[p].count; h++) {
          ev += w[h] * values[h];
          norm += w[h] * mass[h];
        }
        total += ev / norm;
      }
      return (total - input.pot) / 2 / input.pot;
    },
  };
}
