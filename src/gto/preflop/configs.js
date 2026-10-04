// The preflop charts that exist: one solve per stack depth, for cash games (no ante) and tournaments
// (1 big-blind ante). Shared by the solver script (scripts/gto/solvePreflop.mjs) and the app (charts.js).
export const CHART_CONFIGS = [
  ...[20, 30, 40, 60, 100, 150, 200].map((stack) => ({ name: `cash-${stack}`, stack, ante: 0 })),
  ...[10, 15, 20, 25, 30, 40, 60].map((stack) => ({ name: `ante-${stack}`, stack, ante: 1 })),
];

// The chart closest to a real spot: same family (ante or not), nearest depth on a log scale (40 bb is
// closer to 30 than to 60), so a 87 bb stack plays the 100 bb chart.
export function chartFor(stackBB, anteBB = 0) {
  const family = CHART_CONFIGS.filter((c) => (anteBB > 0 ? c.ante > 0 : c.ante === 0));
  const target = Math.log(Math.max(1, stackBB));
  return family.reduce((best, c) => (Math.abs(Math.log(c.stack) - target) < Math.abs(Math.log(best.stack) - target) ? c : best));
}
