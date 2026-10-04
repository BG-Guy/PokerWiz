// The binary format of a solved preflop chart (one stack depth and ante): written by the offline solver
// (scripts/gto/solvePreflop.mjs) and read by the app (charts.js). Files are gzip-compressed (~150-300 KB).
//
//   "PWPC"  magic            u8 version (2)     u16 stack x 10     u8 ante x 10     u32 decision count
//   presence bitmap: one bit per decision node, in tree order (spots the solution almost never reaches are
//   left out), then for each present node (A = its action count, from the tree; classes in grid order):
//     frequencies  (A - 1) x 169 bytes, action by action: share of the class taking it, in 2% steps (0-50);
//                  the last action gets the rest
//     losses       A x 85 bytes: how much worse each action is than the best one for each class, as 4-bit
//                  levels (two classes per byte, see LOSS_LEVELS)
// Grouping by action keeps similar numbers together, which is what makes the files compress well.
import { CLASS_COUNT } from '../cards.js';

const MAGIC = [0x50, 0x57, 0x50, 0x43]; // "PWPC"
const VERSION = 2;
const N = CLASS_COUNT;
const STEPS = 50;
const LOSS_BYTES = Math.ceil(N / 2);

// Loss levels in big blinds: level k covers losses from LOSS_LEVELS[k] up to the next one.
export const LOSS_LEVELS = [0, 0.03, 0.08, 0.15, 0.25, 0.4, 0.6, 0.85, 1.2, 1.7, 2.5, 3.5, 5, 8, 14, 25];
export function encodeLoss(bb) {
  let level = 0;
  for (let k = 1; k < LOSS_LEVELS.length; k++) if (bb >= LOSS_LEVELS[k]) level = k;
  return level;
}
// A level back to big blinds: the middle of its range (geometric), 0 for the best action.
export function decodeLoss(level) {
  if (level === 0) return 0;
  if (level === LOSS_LEVELS.length - 1) return 35;
  return Math.sqrt(LOSS_LEVELS[level] * LOSS_LEVELS[level + 1]);
}

const quantize = (p) => (p < 0.02 ? 0 : p > 0.98 ? STEPS : Math.round(p * STEPS));

// nodes[id] = null (left out) or { strategy, loss } (Float64Array(A x 169) each, action-major).
// tree = buildPreflopTree(stack, ante).
export function encodeChart({ stack, ante, tree, nodes }) {
  const count = tree.decisions.length;
  let bodySize = 0;
  tree.decisions.forEach((decision, id) => {
    const A = decision.actions.length;
    if (nodes[id]) bodySize += (A - 1) * N + A * LOSS_BYTES;
  });
  const bytes = new Uint8Array(12 + Math.ceil(count / 8) + bodySize);
  const view = new DataView(bytes.buffer);
  bytes.set(MAGIC, 0);
  bytes[4] = VERSION;
  view.setUint16(5, Math.round(stack * 10), true);
  bytes[7] = Math.round(ante * 10);
  view.setUint32(8, count, true);
  let at = 12 + Math.ceil(count / 8);
  tree.decisions.forEach((decision, id) => {
    const node = nodes[id];
    if (!node) return;
    bytes[12 + (id >> 3)] |= 1 << (id & 7);
    const A = decision.actions.length;
    // Frequencies: round each class's shares so the stored ones never add up to more than 100%.
    const used = new Int32Array(N);
    for (let a = 0; a < A - 1; a++) {
      for (let c = 0; c < N; c++) {
        const q = Math.min(STEPS - used[c], quantize(node.strategy[a * N + c]));
        bytes[at++] = q;
        used[c] += q;
      }
    }
    for (let a = 0; a < A; a++) {
      for (let c = 0; c < N; c += 2) {
        const high = encodeLoss(node.loss[a * N + c]);
        const low = c + 1 < N ? encodeLoss(node.loss[a * N + c + 1]) : 0;
        bytes[at++] = (high << 4) | low;
      }
    }
  });
  return bytes;
}

// Reads a chart (uncompressed bytes) against the tree it was solved on. Returns { stack, ante, nodes }, with
// nodes[id] = null or { strategy, loss } (Float32Array(A x 169) each, action-major; loss in big blinds).
export function decodeChart(bytes, tree) {
  if (MAGIC.some((b, k) => bytes[k] !== b) || bytes[4] !== VERSION) throw new Error('Not a PokerWiz preflop chart (or an old version)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stack = view.getUint16(5, true) / 10;
  const ante = bytes[7] / 10;
  const count = view.getUint32(8, true);
  if (count !== tree.decisions.length) throw new Error(`Chart has ${count} nodes, the ${stack} bb tree has ${tree.decisions.length}`);
  let at = 12 + Math.ceil(count / 8);
  const nodes = tree.decisions.map((decision, id) => {
    if (!(bytes[12 + (id >> 3)] & (1 << (id & 7)))) return null;
    const A = decision.actions.length;
    const strategy = new Float32Array(A * N);
    const rest = new Int32Array(N).fill(STEPS);
    for (let a = 0; a < A - 1; a++) {
      for (let c = 0; c < N; c++) {
        strategy[a * N + c] = bytes[at] / STEPS;
        rest[c] -= bytes[at++];
      }
    }
    for (let c = 0; c < N; c++) strategy[(A - 1) * N + c] = Math.max(0, rest[c]) / STEPS;
    const loss = new Float32Array(A * N);
    for (let a = 0; a < A; a++) {
      for (let c = 0; c < N; c += 2) {
        const byte = bytes[at++];
        loss[a * N + c] = decodeLoss(byte >> 4);
        if (c + 1 < N) loss[a * N + c + 1] = decodeLoss(byte & 15);
      }
    }
    return { strategy, loss };
  });
  return { stack, ante, nodes };
}
