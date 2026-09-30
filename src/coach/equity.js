// Equity of the hero's hand against one or more weighted villain ranges, by Monte Carlo sampling.
// Each sample draws a combo for every villain (proportional to its weight, skipping card clashes),
// deals the rest of the board, and scores the showdown. Ties split.
import { COMBOS, COMBO_COUNT } from './combos.js';
import { evaluate } from '../utils/handEvaluator.js';

// Cumulative-weight sampler for one range, excluding combos that clash with known cards.
function buildSampler(weights, dead) {
  const indices = [];
  const cumulative = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    const [a, b] = COMBOS[i].cards;
    if (dead.has(a) || dead.has(b)) continue;
    total += w;
    indices.push(i);
    cumulative.push(total);
  }
  return { indices, cumulative, total };
}

function sampleCombo(sampler, random) {
  const target = random() * sampler.total;
  let lo = 0;
  let hi = sampler.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sampler.cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return COMBOS[sampler.indices[lo]].cards;
}

// hero: [c1, c2]; board: int[] (0-5 cards); ranges: Float64Array[]; returns { equity, samples }.
export function equityVsRanges({ hero, board, ranges, iterations = 3000, random }) {
  const dead = new Set([...hero, ...board]);
  const samplers = ranges.map((weights) => buildSampler(weights, dead));
  if (samplers.some((s) => s.total <= 0)) return { equity: null, samples: 0 };

  const deck = [];
  for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
  const need = 5 - board.length;
  const fullBoard = [...board, 0, 0, 0, 0, 0].slice(0, 5);

  let score = 0;
  let samples = 0;
  for (let it = 0; it < iterations; it++) {
    // Villain hands, without clashes between villains.
    const used = new Set();
    const hands = [];
    let ok = true;
    for (const sampler of samplers) {
      let cards = null;
      for (let tries = 0; tries < 12 && !cards; tries++) {
        const pick = sampleCombo(sampler, random);
        if (!used.has(pick[0]) && !used.has(pick[1])) cards = pick;
      }
      if (!cards) {
        ok = false;
        break;
      }
      used.add(cards[0]);
      used.add(cards[1]);
      hands.push(cards);
    }
    if (!ok) continue;

    // Rest of the board.
    let filled = 0;
    while (filled < need) {
      const card = deck[Math.floor(random() * deck.length)];
      if (used.has(card)) continue;
      used.add(card);
      fullBoard[board.length + filled] = card;
      filled++;
    }

    const heroScore = evaluate([...hero, ...fullBoard]);
    let best = heroScore;
    let heroTies = 1;
    let heroBest = true;
    for (const cards of hands) {
      const s = evaluate([...cards, ...fullBoard]);
      if (s > best) {
        best = s;
        heroBest = false;
      } else if (s === best && heroBest) {
        heroTies++;
      }
    }
    score += heroBest ? 1 / heroTies : 0;
    samples++;
  }
  return { equity: samples ? score / samples : null, samples };
}

// Equity against known villain hands (for "against their actual cards" notes).
export function equityVsHands({ hero, board, hands, iterations = 3000, random }) {
  const ranges = hands.map((cards) => {
    const weights = new Float64Array(COMBO_COUNT);
    const index = COMBOS.findIndex((c) => (c.cards[0] === cards[0] && c.cards[1] === cards[1]) || (c.cards[0] === cards[1] && c.cards[1] === cards[0]));
    weights[index] = 1;
    return weights;
  });
  return equityVsRanges({ hero, board, ranges, iterations, random });
}
