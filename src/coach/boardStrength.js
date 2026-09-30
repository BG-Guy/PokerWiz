// Postflop hand strength for every combo on a given board.
//   hs    current strength: percentile of this combo among all possible combos on this board (0 weakest, 1 nuts)
//   draw  extra equity from improving: counted outs to straights/flushes (and sets/two pair via hole cards),
//         turned into equity with the rule of 4 (flop) / rule of 2 (turn); 0 on the river
//   eff   effective strength = hs + (1 - hs) * draw, what players act on
//   scores raw hand scores (for placing a specific hand, e.g. the hero's, among them)
// Cards are integers 0..51. Blocked combos (sharing a card with the board or dead cards) get valid = 0.
import { COMBOS, COMBO_COUNT } from './combos.js';
import { evaluate, categoryOf } from '../utils/handEvaluator.js';

const rankOf = (card) => card >> 2;

export function computeStrengths(board, dead = []) {
  const blocked = new Set([...board, ...dead]);
  const valid = new Uint8Array(COMBO_COUNT);
  const scores = new Float64Array(COMBO_COUNT);
  const category = new Int8Array(COMBO_COUNT).fill(-1);
  const hs = new Float32Array(COMBO_COUNT);
  const draw = new Float32Array(COMBO_COUNT);
  const eff = new Float32Array(COMBO_COUNT);

  // Score every combo that can exist on this board. (Reused buffers: this runs tens of thousands of times.)
  const order = [];
  const extended = [...board, 0];
  for (let i = 0; i < COMBO_COUNT; i++) {
    const hole = COMBOS[i].cards;
    const [a, b] = hole;
    if (blocked.has(a) || blocked.has(b)) continue;
    valid[i] = 1;
    scores[i] = evaluate(hole, board, board.length);
    category[i] = categoryOf(scores[i]);
    order.push(i);
  }

  // Percentile rank; tied hands share the middle of their block.
  order.sort((x, y) => scores[x] - scores[y]);
  const n = order.length;
  for (let start = 0; start < n; ) {
    let end = start;
    while (end + 1 < n && scores[order[end + 1]] === scores[order[start]]) end++;
    const value = n > 1 ? (start + end) / 2 / (n - 1) : 1;
    for (let k = start; k <= end; k++) hs[order[k]] = value;
    start = end + 1;
  }

  // Draws: only with cards still to come.
  const perOut = board.length === 3 ? 0.04 : board.length === 4 ? 0.022 : 0;
  if (perOut > 0) {
    const deck = [];
    for (let c = 0; c < 52; c++) if (!blocked.has(c)) deck.push(c);
    const topBoardRank = Math.max(...board.map(rankOf));
    for (const i of order) {
      const hole = COMBOS[i].cards;
      const [a, b] = hole;
      const current = category[i];
      if (current >= 4) continue; // already a straight or better
      let outs = 0;
      for (const card of deck) {
        if (card === a || card === b) continue;
        extended[board.length] = card;
        const next = categoryOf(evaluate(hole, extended, board.length + 1));
        const hitsHoleCard = rankOf(card) === rankOf(a) || rankOf(card) === rankOf(b);
        if (next >= 4) outs += 1; // straight, flush or better
        else if (current <= 1 && next === 3 && hitsHoleCard) outs += 0.7; // set / trips with a hole card
        else if (current <= 1 && next === 2 && hitsHoleCard) outs += 0.5; // two pair with a hole card
        else if (current === 0 && next === 1 && hitsHoleCard && rankOf(card) > topBoardRank) outs += 0.4; // overcard pairs
      }
      draw[i] = Math.min(0.5, outs * perOut);
    }
  }

  for (const i of order) eff[i] = hs[i] + (1 - hs[i]) * draw[i];
  return { valid, hs, draw, eff, category, scores, sortedScores: order.map((i) => scores[i]) };
}

// Plain-language strength word for a percentile.
export function strengthWord(hs) {
  if (hs >= 0.95) return 'near the nuts';
  if (hs >= 0.85) return 'very strong';
  if (hs >= 0.7) return 'strong';
  if (hs >= 0.5) return 'medium';
  if (hs >= 0.3) return 'weak';
  return 'very weak';
}

// Percentile of a given hand score among the valid combos (same scale as hs).
export function percentileOf(strengths, score) {
  const sorted = strengths.sortedScores;
  let below = 0;
  let equal = 0;
  for (const s of sorted) {
    if (s < score) below++;
    else if (s === score) equal++;
  }
  return sorted.length > 1 ? Math.min(1, (below + equal / 2) / (sorted.length - 1)) : 1;
}
