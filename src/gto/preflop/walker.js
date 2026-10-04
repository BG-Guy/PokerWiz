// Follows a real hand's preflop through the solved 8-max tree: maps the table's seats onto the eight tree
// seats, matches every real action to the closest tree action (bet sizes are translated to the nearest size
// the tree has), narrows each player's range by how often each hand class takes that action, and gives the
// GTO advice for any hand at the current spot.
//
// Seats: an 8-handed table maps one to one. Shorter tables play as if the first seats folded (a 6-max UTG
// is the 8-max lojack, and so on). On a 9-handed table the earliest seat that folds is left out.
// Players who aren't in the logged hand folded before acting.
import { CLASS_COUNT, CLASS_COMBOS, CLASS_NAMES } from '../cards.js';

const N = CLASS_COUNT;
// An action the solution (almost) never takes with any hand (less than OFF_STRATEGY of the range takes it)
// doesn't wipe out the range: it keeps its shape, tilted toward the hands most likely to take it.
const OFF_STRATEGY = 0.01;
const FLOOR = 0.02;

// AA and KK are node-locked to re-raise a single raise (scripts/gto/preflop/cfr.mjs): the flop model values
// flatting them about the same as re-raising, so their other options are shown at least this much (bb) below
// the best re-raise, matching the strategy.
const LOCKED = new Set(['AA', 'KK'].map((name) => CLASS_NAMES.indexOf(name)));
const LOCK_MARGIN = 0.25;

// Tree seat for each table position. preflopOrder: the table's positions in preflop order (UTG first, BB
// last); folders: positions whose first action is a fold (or who aren't in the hand).
export function mapSeats(preflopOrder, folders = new Set()) {
  const T = preflopOrder.length;
  const map = new Map();
  if (T <= 8) {
    preflopOrder.forEach((position, i) => map.set(position, 8 - T + i));
    return map;
  }
  // More than 8: leave out the earliest folders (or, failing that, the earliest seats).
  const extra = T - 8;
  const dropped = new Set(preflopOrder.slice(0, -3).filter((p) => folders.has(p)).slice(0, extra));
  for (const p of preflopOrder) if (dropped.size < extra) dropped.add(p);
  let seat = 0;
  for (const position of preflopOrder) map.set(position, dropped.has(position) ? -1 : seat++);
  return map;
}

// Closest tree action for a real one. real: { type: fold|check|call|raise|allin, to (bb) }.
// Returns { index, note } (note: 'limp' when a limp became the open raise, 'size' when the size was
// translated, 'call' when the tree doesn't allow another caller).
export function matchAction(node, real, stack) {
  const find = (type) => node.actions.findIndex((a) => a.type === type);
  if (real.type === 'fold') return { index: find('fold') >= 0 ? find('fold') : find('check') };
  if (real.type === 'check') return { index: find('check') >= 0 ? find('check') : find('call') };
  if (real.type === 'call') {
    if (find('call') >= 0) return { index: find('call') };
    if (find('check') >= 0) return { index: find('check') };
    // Limping where the tree only opens: the nearest tree action that puts money in is the open.
    const raise = node.actions.findIndex((a) => a.type === 'raise' || a.type === 'allin');
    return { index: raise, note: node.level === 0 ? 'limp' : 'call' };
  }
  // Bets, raises and all-ins: the nearest size (on a log scale) among the tree's raises.
  const options = node.actions.map((a, k) => ({ a, k })).filter(({ a }) => a.type === 'raise' || a.type === 'allin');
  if (!options.length) return { index: find('call') >= 0 ? find('call') : find('check'), note: 'size' };
  const to = real.type === 'allin' ? Math.max(real.to ?? 0, stack) : real.to;
  let best = options[0];
  for (const option of options) {
    if (Math.abs(Math.log(option.a.to / to)) < Math.abs(Math.log(best.a.to / to))) best = option;
  }
  const exact = Math.abs(best.a.to - to) <= Math.max(0.1, 0.06 * to) || (real.type === 'allin' && best.a.type === 'allin');
  return { index: best.k, note: exact ? undefined : 'size' };
}

// chart: from loadChart(); seatOf: Map(table position -> tree seat, -1 = left out).
export function createPreflopWalker(chart, seatOf) {
  let node = chart.tree.root;
  const reach = Array.from({ length: 8 }, () => new Float32Array(N).fill(1));
  const history = [];
  let lost = null; // why the hand can't be followed any more (e.g. four players in the pot)

  // Take tree action `index` at the current node, narrowing the actor's range.
  function take(index, info = {}) {
    const data = chart.dataAt(node);
    const row = reach[node.player];
    if (data) {
      let before = 0;
      let after = 0;
      for (let c = 0; c < N; c++) {
        before += CLASS_COMBOS[c] * row[c];
        after += CLASS_COMBOS[c] * row[c] * data.strategy[index * N + c];
      }
      const floor = after < OFF_STRATEGY * before ? FLOOR : 0;
      for (let c = 0; c < N; c++) row[c] *= data.strategy[index * N + c] + floor;
    }
    history.push({ node, index, ...info });
    node = node.children[index];
  }

  // Tree players who come before `seat` but didn't act in the real hand folded.
  function foldUpTo(seat) {
    while (node.kind === 'decision' && node.player !== seat) {
      const fold = node.actions.findIndex((a) => a.type === 'fold');
      if (fold < 0) return false;
      take(fold, { implicit: true });
    }
    return node.kind === 'decision';
  }

  // Moves the tree to `position`'s turn (folding anyone in between). False if the hand can't be followed.
  function moveTo(position) {
    if (lost) return false;
    const seat = seatOf.get(position);
    if (seat === undefined || seat < 0) return false;
    if (!foldUpTo(seat)) {
      lost = 'The preflop action goes beyond what the solved game covers.';
      return false;
    }
    return true;
  }

  return {
    get node() {
      return node;
    },
    get lost() {
      return lost;
    },
    reach,
    history,
    moveTo,
    // A real action by `position`. real: { type, to (bb) }. Returns the history entry, or null if it couldn't be followed.
    apply(position, real) {
      if (lost) return null;
      const seat = seatOf.get(position);
      if (seat === -1) {
        // A left-out seat (9-handed table): only its fold is expected.
        if (real.type !== 'fold') lost = 'Too many players for the 8-handed solution.';
        return null;
      }
      if (!moveTo(position)) return null;
      const match = matchAction(node, real, chart.config.stack);
      if (match.index < 0) {
        lost = 'This action has no match in the solved game.';
        return null;
      }
      if (match.note === 'call') {
        lost = 'More players called than the solved game allows (it covers pots of up to three players).';
        return null;
      }
      take(match.index, { real, note: match.note });
      return history[history.length - 1];
    },
    // GTO for one hand class at the current spot (call moveTo first). Returns { node, actions,
    // strategy: [share per action], loss: [bb per action, 0 = best], exact } or null.
    advice(cls) {
      if (node.kind !== 'decision') return null;
      const data = chart.dataAt(node);
      if (!data) return null;
      const A = node.actions.length;
      let loss = Array.from({ length: A }, (_, a) => data.loss[a * N + cls]);
      const raises = node.actions.map((x, a) => (x.type === 'raise' || x.type === 'allin' ? a : -1)).filter((a) => a >= 0);
      if (node.level === 1 && LOCKED.has(cls) && raises.length) {
        const bestRaise = Math.min(...raises.map((a) => loss[a]));
        loss = loss.map((l, a) => (raises.includes(a) ? l : Math.max(l, bestRaise + LOCK_MARGIN)));
        const best = Math.min(...loss);
        loss = loss.map((l) => l - best);
      }
      return {
        node,
        actions: node.actions,
        strategy: Array.from({ length: A }, (_, a) => data.strategy[a * N + cls]),
        loss,
        exact: data.exact,
      };
    },
    // A position's range right now as 169 class weights (1 = always here with that class).
    rangeOf(position) {
      const seat = seatOf.get(position);
      return seat >= 0 ? reach[seat] : null;
    },
  };
}
