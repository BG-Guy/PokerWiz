// What the Ranges page is showing: the stack depth and the spot, taken from the link (?spot=BB/BTNr&depth=100), else
// from the last visit on this device, else the usual first look (the big blind facing a button open at 100 bb), the chart
// for that depth, and everything worked out from them (every spot, the grid, the opponent's range, caller variants).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listScenarios, findScenario, nearestScenario, variantsOf } from '../../gto/preflop/scenarios.js';
import { buildGrid, villainRange } from '../../gto/preflop/scenarioGrid.js';
import { useRangeChart } from './useRangeChart.js';

export const DEPTHS = [20, 40, 60, 100, 150, 200];
const DEFAULT_DEPTH = 100;
const DEFAULT_SPOT = 'BB/BTNr';
const STORAGE_KEY = 'pokerwiz-ranges-v1';

// The last spot and depth, if this device kept them (storage can be blocked: then there is just no memory).
function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}
function writeSaved(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Private mode or full storage: the page works the same, it just forgets. */
  }
}

// Returns { depth, chart, loading, error, retry, scenarios, scenario, grid, villain, variants, choose } where
// choose({ depth?, spot? }) changes what is shown (spot: a spot's id) by rewriting the link.
export function useRangeSpot() {
  const [params, setParams] = useSearchParams();
  const [saved] = useState(readSaved);

  const depthParam = Number(params.get('depth'));
  const depth = DEPTHS.includes(depthParam) ? depthParam : DEPTHS.includes(saved.depth) ? saved.depth : DEFAULT_DEPTH;
  const spotId = params.get('spot') ?? saved.spot ?? DEFAULT_SPOT;

  const { chart, loading, error, retry } = useRangeChart(depth);
  const scenarios = useMemo(() => (chart ? listScenarios(chart) : []), [chart]);
  // The spot asked for; at a depth where it doesn't exist, the closest one to the one that was on show.
  const lastSpot = useRef(null);
  const scenario = useMemo(
    () => (scenarios.length ? (findScenario(scenarios, spotId) ?? nearestScenario(scenarios, lastSpot.current) ?? findScenario(scenarios, DEFAULT_SPOT) ?? scenarios[0]) : null),
    [scenarios, spotId]
  );
  useEffect(() => {
    lastSpot.current = scenario;
  }, [scenario]);
  // What is on show is kept for the next visit (once its chart is here, so a depth still loading isn't saved).
  useEffect(() => {
    if (scenario && !loading) writeSaved({ depth, spot: scenario.id });
  }, [scenario, depth, loading]);

  const grid = useMemo(() => (chart && scenario ? buildGrid(chart, scenario) : null), [chart, scenario]);
  const villain = useMemo(() => (chart && scenario ? villainRange(chart, scenario) : null), [chart, scenario]);
  const variants = useMemo(() => (scenario ? variantsOf(scenarios, scenario) : []), [scenarios, scenario]);

  // Replacing the entry, so Back leaves the page instead of stepping through every spot looked at.
  const choose = (next) => {
    const value = { depth, spot: scenario?.id ?? spotId, ...next };
    setParams({ depth: String(value.depth), spot: value.spot }, { replace: true });
  };

  return { depth, chart, loading, error, retry, scenarios, scenario, grid, villain, variants, choose };
}
