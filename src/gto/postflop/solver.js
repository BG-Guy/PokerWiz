// Postflop GTO solver for heads-up and multiway pots (written for PokerWiz, in plain JavaScript so it runs in
// a web worker). Solves from the start of the current street to the end of the hand with Discounted CFR
// (alpha 1.5, beta 0, gamma 4), every hand of every player at once, then reads each hand's strategy and the
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
// Player models (models[p], see src/gto/players): a player who doesn't play GTO. The street is first solved
// with everyone playing GTO. Then every modelled player is fixed to a blend of that GTO strategy and the
// model's policy at each of their decisions (by the model's weight; 1 = the policy alone, see lockModels), and
// everyone else keeps solving against it, so their strategy becomes the best answer to that player. The
// modelled player doesn't adapt back: a player who never bluffs big doesn't start because folding to them has
// become right. (At first their GTO share was its own CFR strategy inside the same solve, which did adapt:
// it added back the bluffs the model left out until calling was right again, so the exploit never showed.)
import { buildHandList, sameHandIndex, handsByCard } from './hands.js';
import { buildPostflopTree, DECISION, CHANCE, FOLD, SHOWDOWN } from './tree.js';
import { strengthsOn, strengthOrder, createLeafEvaluator, cardSums, massAgainst } from './showdown.js';
import { createRandom } from '../../coach/random.js';

const ALPHA = 1.5;
// How much more the later iterations count in the strategy a solve returns: iteration t weighs t^GAMMA.
// Discounted CFR's published 2 suits long solves; a solve here gets 100 to 1200 iterations, and with 4 the
// strategy is closer to equilibrium at every budget measured (exact best responses, button against big blind:
// 0.55% of the pot instead of 0.68% on a K72 flop after 110 iterations, 0.21% instead of 0.24% on the turn
// after 260, the same on the river after 1200; 3-way 0.054% instead of 0.071% on a turn). It also leaves next
// to nothing of the first, random iterations in it: with 2, a bet the solution doesn't make still showed up a
// percent or two of the time with hands picked at random, and the range after that bet was mostly those.
// (Dropping every action a hand takes under 3% of the time instead was tried and made solves worse: 0.22% of
// the pot instead of 0.03% on that river. The thin mixes it removes are how a rarely used size stays balanced.)
const GAMMA = 4;

// On the real line, the action a player really took keeps a small extra share of each hand's reach (a tremble,
// like the preflop solver's), so when the solution would never take it (a bet it never makes) the answers to it
// are still played against a range instead of against nobody, which would leave them untrained.
// Which range: a hand trembles into the action less the more it costs that hand (a "proper" tremble), up to
// TREMBLE for a hand it costs nothing: TREMBLE x exp(-loss / (TREMBLE_COST x the pot)), with the loss against
// the hand's best action taken from the solve itself. So a bet the solution never makes is made by the hands
// that give up least by making it (for a big bet: the strong hands and the cheapest bluffs), not by the whole
// range in equal shares, which read every surprise bet as weak and had the coach raising it with one pair.
// An action taken outside the solve's real line (a later one, in a solve that's reused) keeps REAL_FLOOR.
export const REAL_FLOOR = 0.001;
export const TREMBLE = 0.02;
const TREMBLE_COST = 0.05;
const TREMBLE_MEMORY = 0.9; // how much of the action values' running average is kept each pass
// How far apart (on a log scale) two bet sizes can be and still be made by much the same hands: at 0.5, a size
// 1.5 times another takes over 72% of what a hand does with it, twice the size 38%, three times 9%.
const SIMILAR_WIDTH = 0.5;
const AGGRESSIVE = new Set(['bet', 'raise', 'allin']);

// With player models: the share of the budget that goes to the GTO solve (the rest to the answer to the models),
// and the least each GTO action counts for when it's blended with a model's policy (see lockModels).
const MODEL_GTO_SHARE = 0.6;
const MODEL_GTO_FLOOR = 0.02;

// Per kind of solve: how many turn and river cards are sampled, how many streets have betting (counting the
// one being solved; after that the hand is checked down), how many of the rivers each training pass visits
// (riverDraw, rotating; 0 or left out = all), and how many iterations / ms it gets (a street can set its own
// iterations: a river solve has no cards to come, so a pass takes a fraction of a millisecond per hand and
// 1200 of them fit in well under a second; it used to stop at 260, after 50 ms of its 7 s).
// steady: the iterations a street's solve typically gets before the time limit ends it (measured on a laptop).
// A steady solve (input.steady) runs exactly that many with no time limit, so it gives the same answer on any
// machine under any load: for comparisons and tests, where a verdict mustn't depend on how busy the CPU is.
const BUDGETS = {
  2: {
    // Measured against TexasSolver (scripts/gto-reference) at equal time, since the time limit, not the
    // iteration count, is what ends a solve in the app: 16 turns x 8 rivers, 2 rivers per pass, loses 0.28% of
    // the pot per decision with 0.1% big mistakes, against 0.38% and 0.7% for 12 x 4 with every river visited.
    // More turns help most; river betting in flop solves helps only with several times the iterations.
    full: { flop: { turns: 16, rivers: 8, betting: 2, riverDraw: 2, steady: 110 }, turn: { rivers: 12, betting: 2 }, river: { betting: 1, iterations: 1200 }, iterations: 260, ms: 7000 },
    // Practice: 12 turns x 6 rivers, 2 per pass (0.29% of the pot, 0.3% big mistakes; 8 x 3 with every river
    // visited: 0.36% and 1.2%).
    fast: { flop: { turns: 12, rivers: 6, betting: 2, riverDraw: 2, steady: 70 }, turn: { rivers: 8, betting: 2 }, river: { betting: 1, iterations: 600 }, iterations: 150, ms: 2500 },
  },
  3: {
    // Two turns of every suit, at the same cost as before (heads-up measurements showed lopsided samples cost
    // accuracy; 3-way has no outside reference).
    full: { flop: { turns: 8, rivers: 3, betting: 1, steady: 250 }, turn: { rivers: 12, betting: 1 }, river: { betting: 1, iterations: 1200 }, iterations: 400, ms: 7000 },
    fast: { flop: { turns: 8, rivers: 2, betting: 1, steady: 150 }, turn: { rivers: 8, betting: 1 }, river: { betting: 1, iterations: 600 }, iterations: 220, ms: 2500 },
  },
};

// input: {
//   board: card ids (3-5), ranges: [Float32Array(1326)] per player in postflop order (seat 0 acts first),
//   pot: chips in the middle at the start of the street, stacks: chips behind per player,
//   path: the street's real actions so far [{ player, type, to }],
//   include: [[hand indices] per player] hands that must be in the solve (known cards),
//   detail: 'full' | 'fast', seed, iterations?, ms?,
//   steady?: true = a fixed number of iterations and no time limit (see BUDGETS),
//   sampling?: { turns, rivers, betting, mode, riverDraw } overrides the budget's runout sample, betting
//              streets, how the runouts are picked ('spread', the default, or 'random'), and how many of the
//              rivers each training pass visits (tests, studies)
//   models?: [{ weight (0..1), policy(node, list) -> Float32Array(actions x hands) } | null] per player
//   aggressor?: the player who bet or raised last on the street before (player models bet differently into
//               them, and as them), aggressorRaised?: that was a raise, not just a bet
// }
export function solvePostflop(input) {
  const P = input.ranges.length;
  const detail = input.detail ?? 'full';
  const plan = BUDGETS[Math.min(3, P)][detail];
  const street = { ...{ 3: plan.flop, 4: plan.turn, 5: plan.river }[input.board.length], ...input.sampling };
  const budget = input.steady
    ? { iterations: input.iterations ?? street.steady ?? street.iterations ?? plan.iterations, ms: Infinity }
    : { iterations: input.iterations ?? street.iterations ?? plan.iterations, ms: input.ms ?? plan.ms };
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

  const tree = buildPostflopTree({
    board,
    pot: input.pot,
    stacks: input.stacks,
    path: input.path ?? [],
    deal,
    detail,
    bettingStreets: street.betting,
    aggressor: input.aggressor,
    aggressorRaised: input.aggressorRaised,
  });

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
    const { strategySum } = node;
    for (let h = 0; h < n; h++) {
      let sum = 0;
      for (let a = 0; a < A; a++) sum += strategySum[a * n + h];
      if (sum > 1e-12) for (let a = 0; a < A; a++) out[a * n + h] = strategySum[a * n + h] / sum;
    }
    return out;
  }

  // ----- Player models -----
  // Once the GTO solve is done, every modelled player is fixed (`locked`) to a blend of their GTO strategy and
  // the model's policy at each of their decisions, and plays that from then on. The blend is weighted on the
  // log scale, per hand: (GTO + MODEL_GTO_FLOOR)^(1 - weight) x policy^weight, scaled to add up to 1. So a
  // play needs both to allow it: what the policy all but rules out (a bluff raise on the river) stays out
  // however often GTO makes it, and the floor keeps GTO from ruling out what the policy does (a slowplay).
  // Adding the two up instead let a 10% share of GTO fill a recreational player's river raises with the
  // bluffs and thin raises GTO makes, several times as many as that player's own (the nuts).
  let locked = false;
  const fixedAt = (node) => (locked && models[node.player] ? node.fixed : null);
  function lockModels() {
    for (const node of tree.decisions) {
      const model = models[node.player];
      if (!model) continue;
      const gto = averageStrategy(node);
      const policy = model.policy(node, lists[node.player]);
      const w = model.weight;
      const A = node.actions.length;
      const n = lists[node.player].count;
      const fixed = new Float32Array(gto.length);
      for (let h = 0; h < n; h++) {
        let sum = 0;
        for (let a = 0; a < A; a++) {
          const blend = (gto[a * n + h] + MODEL_GTO_FLOOR) ** (1 - w) * policy[a * n + h] ** w;
          fixed[a * n + h] = blend;
          sum += blend;
        }
        for (let a = 0; a < A; a++) fixed[a * n + h] = sum > 0 ? fixed[a * n + h] / sum : gto[a * n + h];
      }
      node.fixed = fixed;
      node.regrets = null; // not trained any more
      node.strategySum = null;
      // No tremble on top: the policy already gives every hand its share of every action, and a tremble
      // sized for GTO play would swamp an action the model keeps for a sliver of the range (a river raise).
      if (node.tremble) node.tremble.fill(0);
    }
    // Everyone else's average starts again (it's now their answer to the models, not to GTO). Their regrets
    // stay as a warm start, and fade as the new ones come in (the discounting starts over too).
    for (const node of tree.decisions) if (!models[node.player]) node.strategySum.fill(0);
    locked = true;
  }

  // ----- Trembles on the real line (see TREMBLE) -----
  // Everyone else's reach that each hand of player p can meet (the weight on its values at a node).
  const massSums = new Float64Array(52);
  const massOne = new Float64Array(maxHands);
  const massAll = new Float64Array(maxHands);
  function massOf(p, reach) {
    const n = lists[p].count;
    massAll.fill(1, 0, n);
    for (let o = 0; o < P; o++) {
      if (o === p) continue;
      const total = cardSums(lists[o], reach[o], massSums);
      massAgainst(lists[p], same[p][o], reach[o], total, massSums, massOne);
      for (let h = 0; h < n; h++) massAll[h] *= massOne[h];
    }
    return massAll;
  }
  // The extra share of each hand's reach that takes the real action at a node on the real line.
  function trembleOf(node) {
    if (!node.tremble) node.tremble = new Float64Array(lists[node.player].count).fill(fixedAt(node) ? 0 : TREMBLE);
    return node.tremble;
  }
  // A real bet or raise also takes over part of what the hand does with the sizes near it (node.similar: the
  // other bets or raises at the node, by how close their size is on a log scale), again less the more the
  // real size costs the hand. The solution spreads one betting range over the sizes it's offered, and a real
  // size between two of them often ends up unused: it's then made by a blend of the hands that bet the sizes
  // around it (what poker AIs call action translation), which is balanced the way those are, not by the
  // tremble alone, which is whichever hands the size costs least.
  function similarSizes(node) {
    if (node.similar !== undefined) return node.similar;
    const real = node.actions[node.realIndex];
    node.similar = null;
    if (!AGGRESSIVE.has(real.type)) return null;
    const faced = node.actions[0].to + node.toCall; // the bet to call (0 when opening the betting)
    const size = (a) => Math.max(a.to - faced, 1e-9);
    const near = node.actions
      .map((a, i) => ({ i, share: i !== node.realIndex && AGGRESSIVE.has(a.type) ? Math.exp(-(Math.log(size(a) / size(real)) ** 2) / (2 * SIMILAR_WIDTH ** 2)) : 0 }))
      .filter((x) => x.share > 0.05);
    if (near.length) node.similar = near;
    return node.similar;
  }
  // How often hand h takes the real action at a node beyond its own strategy `play` for it: the tremble, plus
  // what it takes over from the similar sizes.
  function realExtra(node, play, tremble, h, n) {
    const similar = similarSizes(node);
    if (!similar || !(tremble[h] > 0)) return tremble[h];
    let borrowed = 0;
    for (const { i, share } of similar) borrowed += share * play[i * n + h];
    return tremble[h] + (tremble[h] / TREMBLE) * borrowed;
  }
  // Refresh it from this pass's action values: less for the hands the real action costs more. The cost is
  // taken from each action's value averaged over the last passes (node.valueAverage), not from one pass: the
  // strategies swing from pass to pass, and a hand that mixes two actions (worth the same at equilibrium) would
  // look like it loses with whichever one is behind on that pass.
  function updateTremble(node, reach, values) {
    const p = node.player;
    const n = lists[p].count;
    const A = node.actions.length;
    const real = node.realIndex * n;
    const mass = massOf(p, reach);
    const scale = TREMBLE_COST * node.pot;
    const tremble = trembleOf(node);
    const keep = node.valueAverage ? TREMBLE_MEMORY : 0;
    if (!node.valueAverage) node.valueAverage = new Float64Array(A * n);
    const average = node.valueAverage;
    for (let h = 0; h < n; h++) {
      if (!(mass[h] > 1e-30)) continue;
      let best = -Infinity;
      for (let a = 0; a < A; a++) {
        const value = keep * average[a * n + h] + (1 - keep) * (values[a * n + h] / mass[h]);
        average[a * n + h] = value;
        if (value > best) best = value;
      }
      tremble[h] = TREMBLE * Math.exp(-(best - average[real + h]) / scale);
    }
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
    // What the player plays here: a fixed mix for a modelled player, otherwise their own strategy.
    const fixed = fixedAt(node);
    let play = fixed;
    if (!fixed) {
      play = buf.sigma;
      if (mode === 'train') currentStrategy(node, play);
      else averageStrategy(node, play);
    }
    const tremble = node.realIndex !== undefined ? trembleOf(node) : null;
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
        if (a === node.realIndex) for (let h = 0; h < n; h++) row[h] = myReach[h] * (play[a * n + h] + realExtra(node, play, tremble, h, n));
        else for (let h = 0; h < n; h++) row[h] = myReach[h] * play[a * n + h];
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
    if (mode !== 'train') return;
    if (fixed) return;
    if (tremble) updateTremble(node, reach, values);
    if (brPlayer >= 0 && brPlayer !== p) return;

    // Discounted CFR: past regrets shrink (positive by t^1.5 / (t^1.5 + 1), negative by half) before this
    // iteration's are added, and the running strategy total shrinks by (t / (t + 1))^GAMMA, so later (better)
    // iterations count more.
    const positive = iteration ** ALPHA / (iteration ** ALPHA + 1);
    const decay = (iteration / (iteration + 1)) ** GAMMA;
    const { regrets, strategySum } = node;
    for (let a = 0; a < A; a++) {
      const base = a * n;
      for (let h = 0; h < n; h++) {
        const old = regrets[base + h];
        regrets[base + h] = old * (old > 0 ? positive : 0.5) + values[base + h] - mine[h];
        strategySum[base + h] = strategySum[base + h] * decay + myReach[h] * play[base + h];
      }
    }
  }

  const startReach = () => lists.map((l) => Float64Array.from(l.weights));

  // ----- Solve -----
  const started = Date.now();
  let iteration = 0; // within the current phase (the discounting starts over when the models are fixed)
  let iterations = 0; // in all
  // Heads-up: alternating updates (one player's regrets per pass) converge faster per pass than updating both.
  // Multiway: everyone at once, so each iteration costs one pass instead of three.
  const alternate = input.alternate ?? P === 2;
  // Train `players` for up to `count` iterations, or until `until` ms after the start (never under `least`).
  function train(players, count, until, least) {
    iteration = 0;
    while (iteration < count) {
      iteration++;
      iterations++;
      if (alternate) for (const p of players) walk(tree.root, startReach(), 0, 'train', iteration, p);
      else walk(tree.root, startReach(), 0, 'train', iteration, -1);
      if (iteration >= least && Date.now() - started > until) break;
    }
  }
  const everyone = [...Array(P).keys()];
  if (!models.some(Boolean)) train(everyone, budget.iterations, budget.ms, 30);
  else {
    // GTO first, then the modelled players are fixed and the others answer them. A pass of the answer costs
    // less heads-up (only one player is still training), so it gets as many iterations as the GTO solve.
    const first = Math.ceil(MODEL_GTO_SHARE * budget.iterations);
    train(everyone, first, MODEL_GTO_SHARE * budget.ms, 30);
    lockModels();
    const free = everyone.filter((p) => !models[p]);
    if (free.length) train(free, alternate ? first : budget.iterations - first, budget.ms, 20);
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
    iterations,
    elapsed,
    // Decision points on the real line: pathNodes[i] is where the street's i-th real action was taken (the
    // last one is where the hand is now, if the street isn't over).
    pathNodes,
    // Where a hand (1326 index) sits in player p's list, or -1 if p can't hold it.
    handPosition: (p, hand) => lists[p].position[hand],
    // The recommended strategy at a node: Float64Array(actions x hands), action-major. For a modelled player,
    // what they're expected to play (GTO mixed with the model's policy).
    strategy: (node) => (fixedAt(node) ? Float64Array.from(node.fixed) : averageStrategy(node)),
    // Whether the node's player is a modelled one (their strategy is the model's, not the solve's own).
    modelled: (node) => fixedAt(node) !== null,
    // How often each hand of the node's player takes action `a` there, as the solve counted it: the strategy
    // plus the tremble (the real action's own, see TREMBLE; REAL_FLOOR for any other).
    taken(node, a) {
      const n = lists[node.player].count;
      const strategy = this.strategy(node);
      const tremble = a === node.realIndex ? node.tremble : null;
      return Float64Array.from({ length: n }, (_, h) => strategy[a * n + h] + (tremble ? realExtra(node, strategy, tremble, h, n) : REAL_FLOOR));
    },
    // Each action's value for the hand at position h of the node's player, in chips relative to folding here
    // (the pot already in counts as winnable: folding = 0). Only for nodes on the real line.
    actionValues(node, h) {
      const p = node.player;
      const n = lists[p].count;
      const mass = opponentMass(node, p)[h];
      // (A modelled player's rare action leaves a tiny reach, but still a range to value the hand against.)
      if (!(mass > 1e-30)) return null;
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
      const taken = this.taken(node, a);
      const out = new Float32Array(1326);
      const reach = node.reachHere[p];
      lists[p].hands.forEach((hand, k) => {
        out[hand] = reach[k] * taken[k];
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
