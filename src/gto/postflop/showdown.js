// Values at the leaves of a postflop solve, for every hand of every player at once ("counterfactual values":
// the payoff weighted by how likely the other players are to be here with each of their hands).
//
// Card removal is exact between each pair of players: sums of the opponents' reach per card let every hand
// subtract the combos it blocks in O(1) (all combos - those holding card 1 - those holding card 2 + the same
// combo, which was subtracted twice). Showdowns sweep both players' hands in strength order, so each pair of
// players costs O(hands). With 3+ players the opponents are treated as independent of each other (their
// blockers on each other are left out), and ties are split exactly through a small polynomial.
import { evaluate } from '../../utils/handEvaluator.js';

// Strength of every hand of a list on a 5-card board (-1 for hands that use a board card).
export function strengthsOn(list, board) {
  const out = new Int32Array(list.count);
  const used = new Set(board);
  const pair = [0, 0];
  for (let k = 0; k < list.count; k++) {
    const a = list.c1[k];
    const b = list.c2[k];
    if (used.has(a) || used.has(b)) {
      out[k] = -1;
      continue;
    }
    pair[0] = a;
    pair[1] = b;
    out[k] = evaluate(pair, board, 5);
  }
  return out;
}

// Hand positions sorted by strength, weakest first.
export function strengthOrder(strength) {
  return Int32Array.from(strength.keys()).sort((x, y) => strength[x] - strength[y]);
}

// Total reach of a row and its sum per card.
export function cardSums(list, reach, sums) {
  sums.fill(0);
  let total = 0;
  for (let k = 0; k < list.count; k++) {
    const r = reach[k];
    if (r === 0) continue;
    total += r;
    sums[list.c1[k]] += r;
    sums[list.c2[k]] += r;
  }
  return total;
}

// For every hand of p: how much of o's reach doesn't share a card with it.
export function massAgainst(pList, same, oReach, total, sums, out) {
  for (let k = 0; k < pList.count; k++) {
    const s = same[k];
    out[k] = total - sums[pList.c1[k]] - sums[pList.c2[k]] + (s >= 0 ? oReach[s] : 0);
  }
}

// For every hand of p (strength order): o's compatible reach that is strictly weaker (lt) and weaker or tied (le).
const sumsLt = new Float64Array(52);
const sumsLe = new Float64Array(52);
export function sweep(pList, pStrength, pOrder, oList, oStrength, oOrder, oReach, same, lt, le) {
  sumsLt.fill(0);
  sumsLe.fill(0);
  let totalLt = 0;
  let totalLe = 0;
  let iLt = 0;
  let iLe = 0;
  const oCount = oList.count;
  for (let n = 0; n < pList.count; n++) {
    const k = pOrder[n];
    const s = pStrength[k];
    while (iLt < oCount && oStrength[oOrder[iLt]] < s) {
      const j = oOrder[iLt++];
      const r = oReach[j];
      totalLt += r;
      sumsLt[oList.c1[j]] += r;
      sumsLt[oList.c2[j]] += r;
    }
    while (iLe < oCount && oStrength[oOrder[iLe]] <= s) {
      const j = oOrder[iLe++];
      const r = oReach[j];
      totalLe += r;
      sumsLe[oList.c1[j]] += r;
      sumsLe[oList.c2[j]] += r;
    }
    const a = pList.c1[k];
    const b = pList.c2[k];
    const sameJ = same[k];
    lt[k] = totalLt - sumsLt[a] - sumsLt[b];
    le[k] = totalLe - sumsLe[a] - sumsLe[b] + (sameJ >= 0 ? oReach[sameJ] : 0);
  }
}

// Heads-up showdown values for every hand of p in one pass (the sweep above, fused with the payoff): what p
// wins (half the pot on a tie) minus what p put in, weighted by o's compatible reach.
function headsUpShowdown(pList, pStrength, pOrder, oList, oStrength, oOrder, oReach, same, mass, pot, invested, out) {
  sumsLt.fill(0);
  sumsLe.fill(0);
  let totalLt = 0;
  let totalLe = 0;
  let iLt = 0;
  let iLe = 0;
  const oCount = oList.count;
  const half = 0.5 * pot;
  for (let n = 0; n < pList.count; n++) {
    const k = pOrder[n];
    const s = pStrength[k];
    while (iLt < oCount && oStrength[oOrder[iLt]] < s) {
      const j = oOrder[iLt++];
      const r = oReach[j];
      totalLt += r;
      sumsLt[oList.c1[j]] += r;
      sumsLt[oList.c2[j]] += r;
    }
    while (iLe < oCount && oStrength[oOrder[iLe]] <= s) {
      const j = oOrder[iLe++];
      const r = oReach[j];
      totalLe += r;
      sumsLe[oList.c1[j]] += r;
      sumsLe[oList.c2[j]] += r;
    }
    const a = pList.c1[k];
    const b = pList.c2[k];
    const sameJ = same[k];
    const lt = totalLt - sumsLt[a] - sumsLt[b];
    const le = totalLe - sumsLe[a] - sumsLe[b] + (sameJ >= 0 ? oReach[sameJ] : 0);
    out[k] = half * (lt + le) - invested * mass[k];
  }
}

// Leaf evaluator for one solve: holds scratch buffers sized for its players.
// game: { lists, same[p][o] } (see solver.js).
export function createLeafEvaluator(game) {
  const P = game.lists.length;
  const sums = Array.from({ length: P }, () => new Float64Array(52));
  const totals = new Float64Array(P);
  const maxHands = Math.max(...game.lists.map((l) => l.count));
  const masses = Array.from({ length: P }, () => Array.from({ length: P }, () => new Float64Array(maxHands)));
  const lts = Array.from({ length: P }, () => new Float64Array(maxHands));
  const les = Array.from({ length: P }, () => new Float64Array(maxHands));
  const coeffs = new Float64Array(P + 1);

  // masses[p][o][k]: o's reach compatible with p's hand k (for every pair, or only those p = only needs).
  function fillMasses(reach, only) {
    for (let o = 0; o < P; o++) if (o !== only) totals[o] = cardSums(game.lists[o], reach[o], sums[o]);
    for (let p = 0; p < P; p++) {
      if (only >= 0 && p !== only) continue;
      for (let o = 0; o < P; o++) {
        if (o !== p) massAgainst(game.lists[p], game.same[p][o], reach[o], totals[o], sums[o], masses[p][o]);
      }
    }
  }

  // Product of the given players' compatible reach for each of p's hands, into `out`.
  const product = new Float64Array(maxHands);
  function productOf(p, players, out) {
    const n = game.lists[p].count;
    out.fill(1, 0, n);
    for (const o of players) {
      const m = masses[p][o];
      for (let k = 0; k < n; k++) out[k] *= m[k];
    }
    return out;
  }
  const othersOf = Array.from({ length: P }, (_, p) => [...Array(P).keys()].filter((o) => o !== p));
  // Players who are still in at a leaf, and who folded, from each player's point of view (cached per leaf).
  function split(leaf, p) {
    if (!leaf.split) leaf.split = othersOf.map((others) => ({ live: others.filter((o) => leaf.alive[o]), folded: others.filter((o) => !leaf.alive[o]) }));
    return leaf.split[p];
  }

  // Everyone else folded: `winner` takes the pot. only: compute just that player's values (-1 = everyone's).
  function fold(leaf, reach, cfv, only = -1) {
    fillMasses(reach, only);
    for (let p = 0; p < P; p++) {
      if (only >= 0 && p !== only) continue;
      const payoff = p === leaf.winner ? leaf.pot - leaf.invested[p] : -leaf.invested[p];
      const out = cfv[p];
      const n = game.lists[p].count;
      productOf(p, othersOf[p], product);
      for (let k = 0; k < n; k++) out[k] = payoff * product[k];
    }
  }

  // Showdown on a 5-card board among the players still in (leaf.alive); board = { strength[p], order[p] }.
  // Pot share against independent opponents: win outright against all, or split with those who tie.
  function showdown(leaf, reach, cfv, board, only = -1) {
    fillMasses(reach, only);
    const alive = leaf.alive;
    const pot = leaf.pot;
    for (let p = 0; p < P; p++) {
      if (only >= 0 && p !== only) continue;
      const list = game.lists[p];
      const n = list.count;
      const out = cfv[p];
      const others = othersOf[p];
      if (!alive[p]) {
        // Folded earlier: loses what they put in.
        const loss = -leaf.invested[p];
        productOf(p, others, product);
        for (let k = 0; k < n; k++) out[k] = loss * product[k];
        continue;
      }
      const { live, folded } = split(leaf, p);
      if (P === 2 && live.length === 1) {
        // Heads-up, both still in: one fused pass.
        const o = live[0];
        headsUpShowdown(list, board.strength[p], board.order[p], game.lists[o], board.strength[o], board.order[o], reach[o], game.same[p][o], masses[p][o], pot, leaf.invested[p], out);
        continue;
      }
      productOf(p, folded, product); // players who folded earlier: their reach only
      for (const o of live) {
        sweep(list, board.strength[p], board.order[p], game.lists[o], board.strength[o], board.order[o], reach[o], game.same[p][o], lts[o], les[o]);
      }
      const invested = leaf.invested[p];
      if (live.length === 1) {
        const o = live[0];
        const lt = lts[o];
        const le = les[o];
        const m = masses[p][o];
        for (let k = 0; k < n; k++) out[k] = product[k] * (pot * 0.5 * (lt[k] + le[k]) - invested * m[k]);
      } else if (live.length === 2) {
        const [a, b] = live;
        const la = lts[a];
        const ea = les[a];
        const lb = lts[b];
        const eb = les[b];
        const ma = masses[p][a];
        const mb = masses[p][b];
        for (let k = 0; k < n; k++) {
          const ta = ea[k] - la[k];
          const tb = eb[k] - lb[k];
          const share = la[k] * lb[k] + 0.5 * (ta * lb[k] + la[k] * tb) + (ta * tb) / 3;
          out[k] = product[k] * (pot * share - invested * ma[k] * mb[k]);
        }
      } else {
        for (let k = 0; k < n; k++) {
          coeffs.fill(0);
          coeffs[0] = 1;
          let degree = 0;
          let allMass = 1;
          for (const o of live) {
            const lt = lts[o][k];
            const tie = les[o][k] - lt;
            for (let d = degree + 1; d >= 1; d--) coeffs[d] = coeffs[d] * lt + coeffs[d - 1] * tie;
            coeffs[0] *= lt;
            degree++;
            allMass *= masses[p][o][k];
          }
          let share = 0;
          for (let d = 0; d <= degree; d++) share += coeffs[d] / (d + 1);
          out[k] = product[k] * (pot * share - invested * allMass);
        }
      }
    }
  }

  return { fold, showdown };
}
