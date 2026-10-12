// Postflop GTO solver for heads-up and multiway pots (written for PokerWiz, in plain JavaScript so it runs in
// a web worker). Solves from the start of the current street to the end of the hand with Discounted CFR
// (alpha 1.5, beta 0, gamma 2), every hand of every player at once, then reads each hand's strategy and the
// value of each action.
//
// Keeping it fast enough for a phone, the way published solvers and poker AIs do (Libratus, Pluribus):
//   - one street at a time: the hand is re-solved when the next card comes, from the ranges the players
//     reached it with (each action narrows the actor's range by how often each hand takes it)
//   - a few bet sizes (sizes.js), plus the real sizes used in the hand (tree.js)
//   - later cards are sampled: a handful of turns, a few rivers per turn, spread over the suits and ranks (the
//     same sample everywhere in the tree, so every line is valued against the same runouts)
//   - multiway pots bet on two streets at most per solve and check the rest down
//
// Player models (models[p], see src/gto/players): a player who doesn't play GTO. At every one of their
// decisions they play (1 - weight) x their own CFR strategy + weight x the model's policy (weight 1 = fully
// node-locked to the policy). Everyone else sees that mix and answers it, so the solve becomes the best
// strategy against that player; the model's own CFR part still adapts within what the model leaves it.
import { buildHandList, sameHandIndex, handsByCard } from './hands.js';
import { buildPostflopTree, DECISION, CHANCE, FOLD, SHOWDOWN } from './tree.js';
import { strengthsOn, strengthOrder, createLeafEvaluator, cardSums, massAgainst } from './showdown.js';
import { createRandom } from '../../coach/random.js';

const ALPHA = 1.5;
const GAMMA = 2;

// Per kind of solve: how many turn and river cards are sampled, how many streets have betting (counting the
// one being solved; after that the hand is checked down), how many of the rivers each training pass visits
// (riverDraw, rotating; 0 or left out = all), and how many iterations / ms it gets.
const BUDGETS = {
  2: {
    // Measured against TexasSolver (scripts/gto-reference) at equal time, since the time limit, not the
    // iteration count, is what ends a solve in the app: 16 turns x 8 rivers, 2 rivers per pass, loses 0.28% of
    // the pot per decision with 0.1% big mistakes, against 0.38% and 0.7% for 12 x 4 with every river visited.
    // More turns help most; river betting in flop solves helps only with several times the iterations.
    full: { flop: { turns: 16, rivers: 8, betting: 2, riverDraw: 2 }, turn: { rivers: 12, betting: 2 }, iterations: 260, ms: 7000 },
    // Practice: 12 turns x 6 rivers, 2 per pass (0.29% of the pot, 0.3% big mistakes; 8 x 3 with every river
    // visited: 0.36% and 1.2%).
    fast: { flop: { turns: 12, rivers: 6, betting: 2, riverDraw: 2 }, turn: { rivers: 8, betting: 2 }, iterations: 150, ms: 2500 },
  },
  3: {
    // Two turns of every suit, at the same cost as before (heads-up measurements showed lopsided samples cost
    // accuracy; 3-way has no outside reference).
    full: { flop: { turns: 8, rivers: 3, betting: 1 }, turn: { rivers: 12, betting: 1 }, iterations: 400, ms: 7000 },
    fast: { flop: { turns: 8, rivers: 2, betting: 1 }, turn: { rivers: 8, betting: 1 }, iterations: 220, ms: 2500 },
  },
};

// input: {
//   board: card ids (3-5), ranges: [Float32Array(1326)] per player in postflop order (seat 0 acts first),
//   pot: chips in the middle at the start of the street, stacks: chips behind per player,
//   path: the street's real actions so far [{ player, type, to }],
//   include: [[hand indices] per player] hands that must be in the solve (known cards),
//   detail: 'full' | 'fast', seed, iterations?, ms?,
//   sampling?: { turns, rivers, betting, mode, riverDraw } overrides the budget's runout sample, betting
//              streets, how the runouts are picked ('spread', the default, or 'random'), and how many of the
//              rivers each training pass visits (tests, studies)
//   models?: [{ weight (0..1), policy(node, list) -> Float32Array(actions x hands) } | null] per player
// }
export function solvePostflop(input) {
  const P = input.ranges.length;
  const detail = input.detail ?? 'full';
  const plan = BUDGETS[Math.min(3, P)][detail];
  const street = { ...{ 3: plan.flop, 4: plan.turn, 5: { betting: 1 } }[input.board.length], ...input.sampling };
  const budget = { iterations: input.iterations ?? plan.iterations, ms: input.ms ?? plan.ms };
  const riverDraw = street.riverDraw || Infinity; // rivers visited per training pass (0 or left out: all)
  const random = createRandom(input.seed ?? 1);
  const board = input.board;
  const models = Array.from({ length: P }, (_, p) => (input.models?.[p]?.weight > 0 ? input.models[p] : null));

  // ----- Players' hands -----
  // Hands below 0.2% of the heaviest barely move anyone's strategy but cost as much as any other: left out.
  const lists = input.ranges.map((weights, p) => buildHandList(weights, board, 2e-3, input.include?.[p] ?? []));
  if (lists.some((l) => l.count === 0)) throw new Error('A player has no possible hands on this board.');
  const same = lists.map((a) => lists.map((b) => (a === b ? null : sameHandIndex(a, b))));
  const byCard = lists.map((l) => handsByCard(l));
  const game = { lists, same };

  // ----- Sampled next cards (the same sample everywhere in the tree) -----
  // Chosen, not drawn at random: a hand's value often hangs on a few cards (a backdoor flush needs two of its
  // suit), and a random handful of turns can easily miss them. So the sample is spread evenly over the four
  // suits (in proportion to what's left of each) and, within a suit, over the ranks at even steps, offset
  // between suits so that together they cover every rank. Rivers rotate those offsets with the turn card.
  // sampling.mode 'random' keeps a random sample (to compare).
  const dealt = new Map();
  function spread(deck, want, rotation) {
    const bySuit = [[], [], [], []];
    for (const c of deck) bySuit[c & 3].push(c); // each suit's cards from low rank to high
    // Picks per suit: proportional to the cards left in it (largest remainder).
    const quota = bySuit.map((cards) => (want * cards.length) / deck.length);
    const picks = quota.map(Math.floor);
    let left = want - picks.reduce((a, b) => a + b, 0);
    for (const s of [0, 1, 2, 3].sort((x, y) => (quota[y] % 1) - (quota[x] % 1))) if (left-- > 0) picks[s]++;
    const out = [];
    bySuit.forEach((cards, s) => {
      const k = Math.min(picks[s], cards.length);
      const offset = (((s + rotation) % 4) + 0.5) / 4;
      for (let i = 0; i < k; i++) out.push(cards[Math.floor(((i + offset) * cards.length) / k)]);
    });
    return out;
  }
  function deal(current) {
    const key = current.join(',');
    if (dealt.has(key)) return dealt.get(key);
    const used = new Set(current);
    const deck = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const want = Math.min(current.length === 3 ? street.turns : street.rivers, deck.length);
    let cards;
    if (street.mode === 'random') {
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      cards = deck.slice(0, want);
    } else {
      cards = spread(deck, want, current.length === 3 ? 0 : current[3] + 1);
    }
    cards.sort((a, b) => a - b);
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
        mixed: new Float64Array(maxActions * maxHands),
        free: new Float64Array(maxHands),
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

  // A modelled player's policy at a node (computed once, on first use).
  function policyAt(node) {
    if (!node.policy) node.policy = models[node.player].policy(node, lists[node.player]);
    return node.policy;
  }

  // What a player actually plays at a node, given their CFR strategy `sigma`: sigma itself, or for a modelled
  // player the mix with the model's policy (into `out`).
  function played(node, sigma, out) {
    const model = models[node.player];
    if (!model) return sigma;
    const policy = policyAt(node);
    const w = model.weight;
    const size = node.actions.length * lists[node.player].count;
    for (let i = 0; i < size; i++) out[i] = (1 - w) * sigma[i] + w * policy[i];
    return out;
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
  // 'br' (best response of brPlayer against everyone's average strategy). When one player is updated or
  // best-responding (brPlayer >= 0), only that player's values are computed: nobody else's are used, and
  // leaf values are most of a solve's time.
  function walk(node, reach, depth, mode, iteration, brPlayer) {
    const buf = buffersAt(depth);
    const cfv = buf.cfv;
    const only = brPlayer;
    if (node.type === FOLD) return evaluator.fold(node, reach, cfv, only);
    if (node.type === SHOWDOWN) return evaluator.showdown(node, reach, cfv, node.info, only);

    if (node.type === CHANCE) {
      // Average over the dealt cards; a hand holding the card can't see that branch (and blocks nobody there).
      // While training, a river chance node visits only `riverDraw` of its cards, a different spread-out
      // subset each iteration, so over a few iterations every river counts equally (most of a pass is river
      // showdowns: this buys more iterations). The final pass and best responses visit them all.
      const all = node.cards.length;
      const draw = mode === 'train' && node.street === 2 && riverDraw < all ? riverDraw : all;
      const step = Math.floor(all / draw);
      const visited = draw === all ? node.cards.keys() : Array.from({ length: draw }, (_, j) => (iteration + j * step) % all);
      const picks = [...visited];
      for (let p = 0; p < P; p++) {
        if (only >= 0 && p !== only) continue;
        cfv[p].fill(0);
        buf.live[p].fill(draw);
        for (const c of picks) for (const h of byCard[p][node.cards[c]]) buf.live[p][h]--;
      }
      const child = buffersAt(depth + 1).cfv;
      for (const c of picks) {
        const card = node.cards[c];
        for (let p = 0; p < P; p++) {
          buf.mask[p].set(reach[p]);
          for (const h of byCard[p][card]) buf.mask[p][h] = 0;
        }
        walk(node.children[c], buf.mask, depth + 1, mode, iteration, brPlayer);
        for (let p = 0; p < P; p++) {
          if (only >= 0 && p !== only) continue;
          for (const h of byCard[p][card]) child[p][h] = 0;
          const out = cfv[p];
          const add = child[p];
          for (let h = 0; h < out.length; h++) out[h] += add[h];
        }
      }
      for (let p = 0; p < P; p++) {
        if (only >= 0 && p !== only) continue;
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
    const play = played(node, sigma, buf.mixed); // what the player really plays here (a model mixes in)
    if (mode === 'final' && node.onPath !== undefined) node.reachHere = reach.map((row) => Float64Array.from(row));
    const values = buf.values;
    const myReach = reach[p];
    const row = buf.rows[p];
    const childReach = reach.slice();
    const mineNeeded = only < 0 || only === p; // this player's own values (regrets, or passed up the tree)
    for (let q = 0; q < P; q++) if (q !== p && (only < 0 || q === only)) cfv[q].fill(0);
    const child = buffersAt(depth + 1).cfv;
    const bestResponse = mode === 'br' && p === brPlayer;
    for (let a = 0; a < A; a++) {
      if (bestResponse) childReach[p] = myReach;
      else {
        for (let h = 0; h < n; h++) row[h] = myReach[h] * play[a * n + h];
        childReach[p] = row;
      }
      walk(node.children[a], childReach, depth + 1, mode, iteration, brPlayer);
      if (mineNeeded) values.set(child[p], a * n);
      for (let q = 0; q < P; q++) {
        if (q === p || (only >= 0 && q !== only)) continue;
        const out = cfv[q];
        const add = child[q];
        for (let h = 0; h < out.length; h++) out[h] += add[h];
      }
    }
    if (!mineNeeded) return;
    const mine = cfv[p];
    for (let h = 0; h < n; h++) {
      let v = bestResponse ? -Infinity : 0;
      for (let a = 0; a < A; a++) v = bestResponse ? Math.max(v, values[a * n + h]) : v + play[a * n + h] * values[a * n + h];
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
    // Regrets are against the player's own CFR strategy (for a modelled player, only that part is free).
    let baseline = mine;
    if (play !== sigma) {
      baseline = buf.free;
      for (let h = 0; h < n; h++) {
        let v = 0;
        for (let a = 0; a < A; a++) v += sigma[a * n + h] * values[a * n + h];
        baseline[h] = v;
      }
    }
    for (let a = 0; a < A; a++) {
      const base = a * n;
      for (let h = 0; h < n; h++) {
        const old = regrets[base + h];
        regrets[base + h] = old * (old > 0 ? positive : 0.5) + values[base + h] - baseline[h];
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
    // The recommended strategy at a node: Float64Array(actions x hands), action-major. For a modelled player,
    // what they're expected to play (their CFR part mixed with the model's policy).
    strategy: (node) => {
      const average = averageStrategy(node);
      const mix = played(node, average, new Float64Array(average.length));
      return mix;
    },
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
      const average = averageStrategy(node);
      const strategy = played(node, average, new Float64Array(average.length));
      const out = new Float32Array(1326);
      const reach = node.reachHere[p];
      lists[p].hands.forEach((hand, k) => {
        out[hand] = reach[k] * strategy[a * n + k];
      });
      return out;
    },
    // For any number of players: how much each one would gain by switching to a best response against
    // everyone else's strategy, as a share of the starting pot, and the total ("NashConv"; 0 = an equilibrium).
    // The convergence check for multiway solves, where there's no outside reference.
    nashConv() {
      // Each hand's weight times the reach of everyone else it can meet (how values are normalised).
      const masses = lists.map((list, p) => {
        const out = new Float64Array(list.count).fill(1);
        const sums = new Float64Array(52);
        const mass = new Float64Array(list.count);
        for (let o = 0; o < P; o++) {
          if (o === p) continue;
          const total = cardSums(lists[o], lists[o].weights, sums);
          massAgainst(list, same[p][o], lists[o].weights, total, sums, mass);
          for (let k = 0; k < list.count; k++) out[k] *= mass[k];
        }
        return out;
      });
      const valueOf = (p, cfv) => {
        let ev = 0;
        let norm = 0;
        for (let k = 0; k < lists[p].count; k++) {
          ev += lists[p].weights[k] * cfv[k];
          norm += lists[p].weights[k] * masses[p][k];
        }
        return ev / norm;
      };
      walk(tree.root, startReach(), 0, 'final', iteration, -1);
      const current = lists.map((_, p) => valueOf(p, buffersAt(0).cfv[p]));
      const gains = lists.map((_, p) => {
        walk(tree.root, startReach(), 0, 'br', iteration, p);
        return (valueOf(p, buffersAt(0).cfv[p]) - current[p]) / input.pot;
      });
      return { gains, total: gains.reduce((a, b) => a + b, 0) };
    },
    // Heads-up: how much a perfect counter-strategy would win, as a share of the starting pot (0 = solved): the
    // average of the two players' best-response gains. (Each player's gain is measured against their own
    // current value: with sampled runouts the two players' values don't add up to exactly the pot, since each
    // hand averages over the sampled cards it doesn't block.)
    exploitability() {
      if (P !== 2) return null;
      return this.nashConv().total / 2;
    },
  };
}
