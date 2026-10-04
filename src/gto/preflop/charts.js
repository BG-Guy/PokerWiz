// Solved preflop charts at runtime: loads the chart for a stack depth (once, then cached), and answers what
// GTO does with each hand class at any node of the 8-max preflop tree.
//
// Loading is pluggable so the same code runs in the browser and in Node tests: the app registers a loader
// that fetches the files Vite bundles (chartUrls.js); tests register one that reads them from disk.
import { buildPreflopTree } from './tree.js';
import { decodeChart } from './chartFormat.js';
import { chartFor } from './configs.js';

let loadBytes = null;
const cache = new Map();

// loader(name) -> Promise<Uint8Array> with the file's bytes (gzip).
export function setChartLoader(loader) {
  loadBytes = loader;
  cache.clear();
}

// Gzip -> raw bytes (the files are compressed; a server may already have inflated them).
async function inflate(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The chart for a spot: { config, tree, dataAt(node) } (see chartFor for how the depth is picked).
export function loadChart(stackBB, anteBB = 0) {
  const config = chartFor(stackBB, anteBB);
  if (!cache.has(config.name)) {
    if (!loadBytes) throw new Error('No preflop chart loader is set');
    cache.set(
      config.name,
      loadBytes(config.name)
        .then(inflate)
        .then((bytes) => {
          const tree = buildPreflopTree(config.stack, config.ante);
          const { nodes } = decodeChart(bytes, tree);
          return createChart(config, tree, nodes);
        })
        .catch((error) => {
          cache.delete(config.name);
          throw error;
        })
    );
  }
  return cache.get(config.name);
}

// Spots the solution never reaches are left out of the files. For those, the closest solved spot stands in:
// same player, same betting level and size to call, and as many of the same players in the pot as possible.
function createChart(config, tree, nodes) {
  const blind = [0, 0, 0, 0, 0, 0, 0.5, 1];
  const inPot = (node) => node.invested.map((x, p) => (x > blind[p] ? p : -1)).filter((p) => p >= 0);
  const signature = (node) => `${node.player}|${node.level}|${node.currentBet}|${node.invested[node.player]}`;
  const bySignature = new Map();
  tree.decisions.forEach((node) => {
    if (!nodes[node.id]) return;
    const key = signature(node);
    if (!bySignature.has(key)) bySignature.set(key, []);
    bySignature.get(key).push(node);
  });

  function standIn(node) {
    const candidates = bySignature.get(signature(node)) ?? [];
    const mine = new Set(inPot(node));
    let best = null;
    let bestScore = -Infinity;
    for (const other of candidates) {
      if (other.actions.length !== node.actions.length) continue;
      const theirs = inPot(other);
      const score = theirs.filter((p) => mine.has(p)).length - Math.abs(theirs.length - mine.size);
      if (score > bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }

  return {
    config,
    tree,
    // { strategy, loss, exact } for a node (Float32Array(actions x 169), action-major): its own, a stand-in's
    // when the node itself wasn't stored (exact: false), or null when nothing fits.
    dataAt(node) {
      if (nodes[node.id]) return { ...nodes[node.id], exact: true };
      const other = standIn(node);
      return other ? { ...nodes[other.id], exact: false } : null;
    },
  };
}
