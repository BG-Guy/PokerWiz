// How the browser loads the solved preflop charts: Vite bundles the .pfc files (fingerprinted, cached for
// good) and this registers a loader that fetches them. Imported once by each web worker that uses the engine.
import { setChartLoader } from './preflop/charts.js';

const urls = import.meta.glob('./preflop/charts/*.pfc', { query: '?url', import: 'default', eager: true });

setChartLoader(async (name) => {
  const url = urls[`./preflop/charts/${name}.pfc`];
  if (!url) throw new Error(`The ${name} preflop chart is missing from this build.`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load the ${name} preflop chart (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
});
