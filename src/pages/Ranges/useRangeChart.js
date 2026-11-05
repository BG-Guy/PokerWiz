// Loads the solved preflop chart for a stack depth, for the Ranges page. The chart of the depth before stays
// available while the next one loads, so the grid doesn't blank out when you change depth.
import { useCallback, useEffect, useState } from 'react';
import '../../gto/chartUrls.js'; // tells the chart loader how the browser fetches the bundled chart files
import { loadChart } from '../../gto/preflop/charts.js';

// Returns { chart (the latest loaded one), loading (the chart for `depth` isn't here yet), error, retry }.
export function useRangeChart(depth) {
  const [state, setState] = useState({ chart: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState((current) => ({ ...current, error: null }));
    // Cash charts only (no ante): the depth picked is the chart's own depth.
    Promise.resolve()
      .then(() => loadChart(depth, 0))
      .then(
        (chart) => live && setState({ chart, error: null }),
        (error) => live && setState((current) => ({ ...current, error }))
      );
    return () => {
      live = false;
    };
  }, [depth, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = !state.error && (!state.chart || state.chart.config.stack !== depth);
  return { chart: state.chart, loading, error: state.error, retry };
}
