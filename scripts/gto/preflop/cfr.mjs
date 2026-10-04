// Preflop GTO solver: Discounted CFR (Brown & Sandholm 2019; alpha 1.5, beta 0, gamma 2) over the 8-max preflop
// tree (src/gto/preflop/tree.js), with every player's strategy for all 169 hand classes updated at once
// ("vector" CFR: one pass of the tree per iteration carries every class's reach probability).
//
// Values at the end of the preflop betting come from payoffs.mjs (equity, or equity x realization when a flop
// is seen). Card removal between the players in the pot is exact at the class level; players who folded affect
// the others through how often they fold (blocker effects of folded hands are left out).
// Every action keeps a tiny probability (TREMBLE) while training, so lines the solution avoids are still
// reached and get sensible answers (what to do after an unusual limp, a 3-bet with the wrong hand...).
import { buildPreflopTree, PLAYERS, POSTFLOP_ORDER } from '../../../src/gto/preflop/tree.js';
import { CLASS_COUNT, CLASS_COMBOS, CLASS_NAMES } from '../../../src/gto/cards.js';
import { createPayoffs, classRanks } from './payoffs.mjs';

const N = CLASS_COUNT;
// Node-lock: AA and KK facing a single raise always re-raise, as in every published chart. Without it the
// realization model makes flatting them nearly as good as re-raising (the flop model can't see how much more a
// bigger pot is worth to them), and the solution drifted into flatting them a third of the time in some spots.
const PREMIUM_LOCK = ['AA', 'KK'].map((name) => CLASS_NAMES.indexOf(name));
const ALPHA = 1.5;
const GAMMA = 2;
const TREMBLE = 0.001;

// Per class: its two ranks, and the combos of it holding one given card of its rank (for card removal).
const HIGH = new Int32Array(N);
const LOW = new Int32Array(N);
const PER_CARD = new Float64Array(N);
for (let c = 0; c < N; c++) {
  const [h, l] = classRanks(c);
  HIGH[c] = h;
  LOW[c] = l;
  PER_CARD[c] = h === l ? 3 : CLASS_COMBOS[c] === 4 ? 1 : 3;
}

// Reach mass of an opponent's row as seen by one combo of each class (card removal), 1 = a full range:
// mass(i) = (all combos - combos sharing either of i's cards + i's own combo) / 1225, weighted by reach.
const rankSums = new Float64Array(13);
export function massOf(row, out) {
  rankSums.fill(0);
  let total = 0;
  for (let j = 0; j < N; j++) {
    const r = row[j];
    if (r === 0) continue;
    total += CLASS_COMBOS[j] * r;
    rankSums[HIGH[j]] += PER_CARD[j] * r;
    if (LOW[j] !== HIGH[j]) rankSums[LOW[j]] += PER_CARD[j] * r;
  }
  for (let i = 0; i < N; i++) out[i] = (total - rankSums[HIGH[i]] - rankSums[LOW[i]] + row[i]) / 1225;
  return total;
}

export function createPreflopSolver({ stack, ante = 0, table, model }) {
  const tree = buildPreflopTree(stack, ante);
  const payoffs = createPayoffs(table, model);
  const B = payoffs.buckets;
  const { K, bucketOf } = payoffs;

  // ----- Per-node buffers -----
  for (const node of tree.decisions) {
    const A = node.actions.length;
    node.regrets = new Float64Array(A * N);
    node.strategySum = new Float64Array(A * N);
    node.sigma = new Float64Array(A * N).fill(1 / A);
    node.childReach = Array.from({ length: A }, () => new Float64Array(N));
    // Facing exactly one raise: where the premium lock applies (its raise and all-in options).
    const raises = node.actions.map((a, k) => (a.type === 'raise' || a.type === 'allin' ? k : -1)).filter((k) => k >= 0);
    if (node.level === 1 && raises.length) node.lockRaises = raises;
  }
  for (const node of [...tree.decisions, ...tree.terminals]) node.cfv = Array.from({ length: PLAYERS }, () => new Float64Array(N));

  // ----- Terminal setup: who is where postflop, what's left behind, which payoff tables apply -----
  for (const t of tree.terminals) {
    if (t.kind === 'fold') continue;
    const order = [...t.players].sort((a, b) => POSTFLOP_ORDER.indexOf(a) - POSTFLOP_ORDER.indexOf(b));
    t.order = order;
    const isFlop = t.kind === 'flop';
    const behind = stack - Math.max(...order.map((p) => t.invested[p]));
    const spr = isFlop ? behind / t.pot : 0;
    if (order.length === 2) t.matrices = order.map((_, seat) => (isFlop ? payoffs.flop2(seat, spr) : payoffs.allIn2));
    else t.shares = order.map((_, seat) => payoffs.share3Table(seat, spr, isFlop));
  }

  // Scratch space for terminal evaluation.
  const masses = Array.from({ length: PLAYERS }, () => new Float64Array(N));
  const others = new Float64Array(N);
  const bucketMass = Array.from({ length: 3 }, () => new Float64Array(N * B));

  // Product of every player's mass except the skipped ones, into `out`.
  function productExcept(out, skipA, skipB = -1, skipC = -1) {
    out.fill(1);
    for (let r = 0; r < PLAYERS; r++) {
      if (r === skipA || r === skipB || r === skipC) continue;
      const m = masses[r];
      for (let i = 0; i < N; i++) out[i] *= m[i];
    }
  }

  // Counterfactual values at a terminal for every player: per class, the payoff weighted by how likely the
  // other players are to be here with their hands.
  function evaluateTerminal(t, reach) {
    for (let r = 0; r < PLAYERS; r++) massOf(reach[r], masses[r]);
    const cfv = t.cfv;

    if (t.kind === 'fold') {
      for (let p = 0; p < PLAYERS; p++) {
        productExcept(others, p);
        const payoff = p === t.winner ? t.pot - t.invested[p] : -t.invested[p];
        const out = cfv[p];
        for (let i = 0; i < N; i++) out[i] = payoff * others[i];
      }
      return;
    }

    const inPot = t.order;
    // Players who folded (or never put money in voluntarily): a fixed loss, scaled by everyone else's reach.
    for (let p = 0; p < PLAYERS; p++) {
      if (inPot.includes(p)) continue;
      productExcept(others, p);
      const out = cfv[p];
      const loss = -t.invested[p];
      for (let i = 0; i < N; i++) out[i] = loss * others[i];
    }

    if (inPot.length === 2) {
      for (let seat = 0; seat < 2; seat++) {
        const p = inPot[seat];
        const q = inPot[1 - seat];
        productExcept(others, p, q);
        const matrix = t.matrices[seat];
        const rq = reach[q];
        const mq = masses[q];
        const out = cfv[p];
        const invested = t.invested[p];
        for (let i = 0; i < N; i++) {
          let share = 0;
          const base = i * N;
          for (let j = 0; j < N; j++) share += matrix[base + j] * rq[j];
          out[i] = others[i] * (t.pot * share - invested * mq[i]);
        }
      }
      return;
    }

    // 3-way: each in-pot player's reach, grouped by strength bucket and weighted by card removal for every class.
    for (let k = 0; k < 3; k++) {
      const row = reach[inPot[k]];
      const out = bucketMass[k];
      out.fill(0);
      for (let i = 0; i < N; i++) {
        const base = i * N;
        const outBase = i * B;
        for (let j = 0; j < N; j++) out[outBase + bucketOf[j]] += row[j] * K[base + j];
      }
    }
    for (let seat = 0; seat < 3; seat++) {
      const p = inPot[seat];
      const a = (seat + 1) % 3;
      const b = (seat + 2) % 3;
      productExcept(others, p, inPot[a], inPot[b]);
      const mq = masses[inPot[a]];
      const ms = masses[inPot[b]];
      // Shares are stored for (opponent who acts earlier, later); y indexes the first of the two.
      const [first, second] = a < b ? [bucketMass[a], bucketMass[b]] : [bucketMass[b], bucketMass[a]];
      const shares = t.shares[seat];
      const out = cfv[p];
      const invested = t.invested[p];
      for (let i = 0; i < N; i++) {
        let share = 0;
        const sBase = i * B * B;
        const qBase = i * B;
        for (let y = 0; y < B; y++) {
          const wy = first[qBase + y];
          if (wy === 0) continue;
          let inner = 0;
          const row = sBase + y * B;
          for (let z = 0; z < B; z++) inner += second[qBase + z] * shares[row + z];
          share += wy * inner;
        }
        out[i] = others[i] * (t.pot * share - invested * mq[i] * ms[i]);
      }
    }
  }

  // Regret matching: the current strategy from positive regrets (uniform when none are positive), then the
  // premium lock (see PREMIUM_LOCK).
  function updateSigma(node) {
    const A = node.actions.length;
    const { regrets, sigma } = node;
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let a = 0; a < A; a++) {
        const r = regrets[a * N + i];
        if (r > 0) sum += r;
      }
      for (let a = 0; a < A; a++) {
        const r = regrets[a * N + i];
        sigma[a * N + i] = sum > 0 ? (r > 0 ? r / sum : 0) : 1 / A;
      }
    }
    if (node.lockRaises) lockToRaises(node);
  }

  // AA and KK facing a single raise only re-raise: fold and call are taken away, and the solver still picks
  // among the raise sizes (3-bet or shove) by their regrets.
  function lockToRaises(node) {
    const { sigma } = node;
    for (const i of PREMIUM_LOCK) {
      let raised = 0;
      for (const a of node.lockRaises) raised += sigma[a * N + i];
      node.actions.forEach((_, a) => {
        if (!node.lockRaises.includes(a)) sigma[a * N + i] = 0;
        else sigma[a * N + i] = raised > 0 ? sigma[a * N + i] / raised : 1 / node.lockRaises.length;
      });
    }
  }

  // One pass of the tree. 'train' updates regrets and the average strategy; 'final' only computes values with
  // node.sigma (set to the average strategy beforehand), keeping each player's reach at every node.
  function walk(node, reach, mode, iteration) {
    if (node.kind !== 'decision') {
      evaluateTerminal(node, reach);
      return;
    }
    const p = node.player;
    const A = node.actions.length;
    if (mode === 'train') updateSigma(node);
    else node.reachAtNode = reach.map((row) => Float64Array.from(row));
    const { sigma } = node;
    const myReach = reach[p];
    const tremble = mode === 'train' ? TREMBLE : 0;
    for (let a = 0; a < A; a++) {
      const childRow = node.childReach[a];
      for (let i = 0; i < N; i++) childRow[i] = myReach[i] * (sigma[a * N + i] * (1 - A * tremble) + tremble);
      const childReach = reach.slice();
      childReach[p] = childRow;
      walk(node.children[a], childReach, mode, iteration);
    }

    // Values here: everyone else's add up over the actions; the actor's mixes them by the strategy.
    for (let q = 0; q < PLAYERS; q++) {
      const out = node.cfv[q];
      out.fill(0);
      for (let a = 0; a < A; a++) {
        const child = node.children[a].cfv[q];
        if (q === p) for (let i = 0; i < N; i++) out[i] += sigma[a * N + i] * child[i];
        else for (let i = 0; i < N; i++) out[i] += child[i];
      }
    }
    if (mode !== 'train') return;

    // Discounted CFR: past regrets shrink (positive by t^1.5 / (t^1.5 + 1), negative by half) before this
    // iteration's are added, and the running strategy total shrinks by (t / (t + 1))^2, so later (better)
    // iterations count more.
    const nodeValue = node.cfv[p];
    const positive = iteration ** ALPHA / (iteration ** ALPHA + 1);
    const decay = (iteration / (iteration + 1)) ** GAMMA;
    for (let a = 0; a < A; a++) {
      const child = node.children[a].cfv[p];
      const base = a * N;
      for (let i = 0; i < N; i++) {
        const old = node.regrets[base + i];
        node.regrets[base + i] = old * (old > 0 ? positive : 0.5) + child[i] - nodeValue[i];
        node.strategySum[base + i] = node.strategySum[base + i] * decay + myReach[i] * sigma[base + i];
      }
    }
  }

  const fullReach = () => Array.from({ length: PLAYERS }, () => new Float64Array(N).fill(1));
  let iteration = 0;

  // The average strategy at a node (the current one for classes that never get there).
  function averageStrategy(node) {
    const A = node.actions.length;
    const out = new Float64Array(A * N);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let a = 0; a < A; a++) sum += node.strategySum[a * N + i];
      for (let a = 0; a < A; a++) out[a * N + i] = sum > 1e-12 ? node.strategySum[a * N + i] / sum : node.sigma[a * N + i];
    }
    return out;
  }

  return {
    tree,
    get iteration() {
      return iteration;
    },
    averageStrategy,
    // Run more iterations.
    run(count) {
      for (let k = 0; k < count; k++) {
        iteration++;
        walk(tree.root, fullReach(), 'train', iteration);
      }
    },
    // Final pass with the average strategy. Per node: the strategy, each action's value for every class (bb per
    // combo, given the node is reached), how much worse each action is than the best, how likely the
    // opponents are to get here (averaged over the actor's hands), and how likely the node is at all.
    finish() {
      const strategies = tree.decisions.map((node) => averageStrategy(node));
      tree.decisions.forEach((node, id) => node.sigma.set(strategies[id]));
      walk(tree.root, fullReach(), 'final', iteration);

      const losses = [];
      const values = [];
      const opponentReach = [];
      const reachProbability = [];
      const mass = new Float64Array(N);
      const opp = new Float64Array(N);
      for (const node of tree.decisions) {
        const p = node.player;
        const A = node.actions.length;
        opp.fill(1);
        for (let r = 0; r < PLAYERS; r++) {
          if (r === p) continue;
          massOf(node.reachAtNode[r], mass);
          for (let i = 0; i < N; i++) opp[i] *= mass[i];
        }
        let probability = 0;
        let opponents = 0;
        for (let i = 0; i < N; i++) {
          probability += (CLASS_COMBOS[i] / 1326) * node.reachAtNode[p][i] * opp[i];
          opponents += (CLASS_COMBOS[i] / 1326) * opp[i];
        }
        reachProbability.push(probability);
        opponentReach.push(opponents);
        const value = new Float64Array(A * N);
        const loss = new Float64Array(A * N);
        for (let i = 0; i < N; i++) {
          let best = -Infinity;
          for (let a = 0; a < A; a++) {
            const v = opp[i] > 1e-15 ? node.children[a].cfv[p][i] / opp[i] : 0;
            value[a * N + i] = v;
            best = Math.max(best, v);
          }
          for (let a = 0; a < A; a++) loss[a * N + i] = best - value[a * N + i];
        }
        values.push(value);
        losses.push(loss);
      }
      return { strategies, losses, values, opponentReach, reachProbability };
    },
  };
}
