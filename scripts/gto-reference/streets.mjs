// Ranges that reach a later street: each player's starting weights times the reference's strategy for the
// actions they took on the line (so a turn or river spot starts from exactly where the reference got to).
import { cardId, cardCode, handIndex, HAND_CARDS, HAND_COUNT } from '../../src/gto/cards.js';

// ref: { steps } from texasLine. start: { oop, ip } (1326 weights). TexasSolver's player 1 is out of position.
export function rangesAfter(ref, start) {
  const out = { oop: Float32Array.from(start.oop), ip: Float32Array.from(start.ip) };
  for (const { node, index } of ref.steps) {
    const side = node.player === 1 ? out.oop : out.ip;
    const seen = new Float32Array(HAND_COUNT);
    for (const [combo, freqs] of Object.entries(node.strategy.strategy)) seen[handIndex(cardId(combo.slice(0, 2)), cardId(combo.slice(2, 4)))] = freqs[index];
    for (let h = 0; h < HAND_COUNT; h++) side[h] *= seen[h];
  }
  return out;
}

// 1326 weights -> TexasSolver's exact-combo range text ("AhKh:0.532,..."), heaviest = 1; combos the board
// blocks or that are too light for TexasSolver (under 0.005) are left out.
export function toTexasCombos(weights, board) {
  const dead = new Set(board.map(cardId));
  let max = 0;
  for (let h = 0; h < HAND_COUNT; h++) if (!dead.has(HAND_CARDS[h][0]) && !dead.has(HAND_CARDS[h][1])) max = Math.max(max, weights[h]);
  const parts = [];
  for (let h = 0; h < HAND_COUNT; h++) {
    const [a, b] = HAND_CARDS[h];
    if (dead.has(a) || dead.has(b)) continue;
    const w = Math.round((1000 * weights[h]) / max) / 1000;
    if (w > 0.005) parts.push(`${cardCode(b)}${cardCode(a)}:${w}`);
  }
  return parts.join(',');
}

// The same weights after rounding to what TexasSolver gets (so the engine solves the very same ranges).
export function roundedLike(weights, board) {
  const dead = new Set(board.map(cardId));
  let max = 0;
  for (let h = 0; h < HAND_COUNT; h++) if (!dead.has(HAND_CARDS[h][0]) && !dead.has(HAND_CARDS[h][1])) max = Math.max(max, weights[h]);
  return Float32Array.from(weights, (w, h) => {
    const [a, b] = HAND_CARDS[h];
    if (dead.has(a) || dead.has(b)) return 0;
    const r = Math.round((1000 * w) / max) / 1000;
    return r > 0.005 ? r : 0;
  });
}
