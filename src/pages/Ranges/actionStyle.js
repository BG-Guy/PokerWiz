// How the Ranges page paints a spot's actions: each action's colour (a token from Ranges.css: fold blue-grey, call
// green, check teal, raises red from light to dark, all in darkest) and the stacked colour bar of a hand.

// Which shade of red a raise gets, by how many raise sizes the spot has (the smallest is the lightest).
const RAISE_SHADES = { 1: [2], 2: [1, 3], 3: [1, 2, 3] };

// The CSS colour of one action of a spot (actions: all of the spot's actions).
export function colorOf(action, actions) {
  if (action.family === 'fold') return 'var(--rg-fold)';
  if (action.family === 'call') return 'var(--rg-call)';
  if (action.family === 'check') return 'var(--rg-check)';
  if (action.family === 'allin') return 'var(--rg-allin)';
  if (action.family === 'range') return 'var(--rg-range)';
  const sizes = actions.filter((a) => a.family === 'raise').sort((a, b) => a.to - b.to);
  const shades = RAISE_SHADES[Math.min(3, sizes.length)];
  return `var(--rg-raise-${shades[Math.min(sizes.findIndex((a) => a.index === action.index), shades.length - 1)]})`;
}

// A horizontal bar made of coloured parts side by side: parts = [{ color, share }] in drawing order. Parts too small
// to see are left out; one part is a flat colour.
export function barBackground(parts) {
  const shown = parts.filter((p) => p.share >= 0.004);
  if (!shown.length) return 'var(--rg-dim)';
  if (shown.length === 1) return shown[0].color;
  const total = shown.reduce((sum, p) => sum + p.share, 0);
  let at = 0;
  const stops = shown.map((p, i) => {
    const from = (at / total) * 100;
    at += p.share;
    const to = i === shown.length - 1 ? 100 : (at / total) * 100;
    return `${p.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// The bar of one hand: each action's share of the hand, biggest bet on the left, the fold on the right. With a
// highlighted action only that action is coloured and the rest is left plain.
export function handBackground(freq, grid, highlight = null) {
  const { actions, order } = grid;
  // A range (one "action"): filled as far as the hand is in it.
  if (actions.length === 1) highlight = 0;
  if (highlight === null) return barBackground(order.map((a) => ({ color: colorOf(actions[a], actions), share: freq[a] })));
  return barBackground([
    { color: colorOf(actions[highlight], actions), share: freq[highlight] },
    { color: 'var(--rg-dim)', share: 1 - freq[highlight] },
  ]);
}

// "12.7%" for a share, "12%" with no decimals, and "<1%" for a sliver.
export function percent(share, digits = 0) {
  if (share > 0 && share < 0.005 && digits === 0) return '<1%';
  return `${(share * 100).toFixed(digits)}%`;
}
