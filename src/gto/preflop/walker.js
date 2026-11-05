// Follows a real hand's preflop through the solved 8-max tree: maps the table's seats onto the eight tree
// seats, matches every real action to the closest tree action (bet sizes are translated to the nearest size
// the tree has), narrows each player's range by how often each hand class takes that action, and gives the
// GTO advice for any hand at the current spot.
//
// Seats: an 8-handed table maps one to one. Shorter tables play as if the first seats folded (a 6-max UTG
// is the 8-max lojack, and so on). On a 9-handed table the earliest seat that folds is left out.
// Players who aren't in the logged hand folded before acting.
//
// Limps: the solved game has no limps except the small blind's. A player who limps counts as folded in the
// tree, so every later raise keeps its meaning at the table (an iso-raise is an open, a re-raise over it a
// 3-bet), and the limper's range is kept here instead: a typical live limper's (limpRange). The tree's one
// limped pot, the small blind limping into the big blind, stands in for the decisions limps lead to: its
// small blind plays the limpers, its big blind the player who raised them (or the big blind checking them).
// Advice from a stand-in is marked as not exact.
import { CLASS_COUNT, CLASS_COMBOS } from '../cards.js';
import { SB, BB } from './tree.js';
import { lockedLosses } from './premiums.js';
import { PREFLOP_BY_CLASS } from '../../coach/preflopTable.js';

const N = CLASS_COUNT;
// An action the solution (almost) never takes with any hand (less than OFF_STRATEGY of the range takes it)
// doesn't wipe out the range: it keeps its shape, tilted toward the hands most likely to take it.
const OFF_STRATEGY = 0.01;
const FLOOR = 0.02;

// The premiums are node-locked to re-raise a single raise, and the middle pairs to flat it (scripts/gto/preflop/
// cfr.mjs, premiums.js): what the locks rule out is shown a little worse than the best play (lockedLosses), so the
// cost agrees with the strategy.

// A limper plays the opening range of the seat this many places later (up to the button): players who limp
// play looser than players who raise. Premiums are usually raised, so few of them limp: the top 3.8% of
// hands (AA-AK) a quarter of the time, the next 3.8% (JJ-77, AQ, AJs, ATs, KQs) 60% of the time.
const LIMP_WIDER_BY = 4;
const BUTTON = 5;
const limpKeep = (cls) => (PREFLOP_BY_CLASS[cls].end <= 0.0377 ? 0.25 : PREFLOP_BY_CLASS[cls].end <= 0.0754 ? 0.6 : 1);

// A limper facing a raise and a re-raise has no stand-in: they continue with the top of their range (re-raise
// the top 4%, call the next 16%) and fold the rest.
const VS_RERAISE = { raise: 0.04, call: 0.2 };

// Facing limpers (nobody has raised yet), raises are cut to the strongest hands: the limpers are still in, so
// a raise steals less and gets called more, and the big blind plays them out of position (its stand-in, the
// small blind's limp, is played in position). Only the top LIMPED_RAISE of all hands keep raising against one
// limper (LIMPED_STEP less for each extra one, never below LIMPED_MIN); the rest of those raises become the
// passive play (fold, or complete / check from the blinds), and a cut raise is shown LIMPED_MARGIN bb worse.
const LIMPED_RAISE = 0.22;
const LIMPED_STEP = 0.04;
const LIMPED_MIN = 0.1;
const LIMPED_MARGIN = 0.1;
const limpedCap = (limpers) => Math.max(LIMPED_MIN, LIMPED_RAISE - LIMPED_STEP * (limpers - 1));
// How much of a class lies inside the top `cap` of all hands (0..1).
function insideTop(cls, cap) {
  const { start, end } = PREFLOP_BY_CLASS[cls];
  return end <= cap ? 1 : start >= cap ? 0 : (cap - start) / (end - start);
}
const BY_STRENGTH = Array.from({ length: N }, (_, c) => c).sort((a, b) => PREFLOP_BY_CLASS[a].start - PREFLOP_BY_CLASS[b].start);

const isRaise = (type) => type === 'raise' || type === 'allin';

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
// models: Map(tree seat -> player model, see gto/players/models.js): those seats play the chart bent toward
// their tendency (it shapes their range and the advice for them).
export function createPreflopWalker(chart, seatOf, models = new Map()) {
  const root = chart.tree.root;
  let node = root; // where the hand is in the tree
  let current = null; // the node the last moveTo landed on: the tree's, or a stand-in
  let currentSeat = -1; // whose decision that is (tree seat; a stand-in's node belongs to another seat)
  let lost = null; // why the hand can't be followed any more (e.g. four players in the pot)
  let missing = null; // why the last moveTo found no node
  const reach = Array.from({ length: 8 }, () => new Float32Array(N).fill(1));
  const limpers = new Map(); // position -> Float32Array(169): players still in after limping (off the tree)
  let raises = 0; // raises in the real hand so far
  // The limped-pot stand-in: { node, raiser (the position playing its big blind), limper (a limper who re-raised) }.
  let standIn = null;

  // The strategy a player follows at a node: the chart's, or their model's version of it. Cached per hand
  // (chart trees are shared between hands, so nothing is stored on the nodes).
  const bent = new Map();
  function strategyAt(at, data, seat) {
    const model = models.get(seat);
    if (!model) return data.strategy;
    const key = `${at.id}|${seat}|${data.cap ?? ''}`;
    if (!bent.has(key)) bent.set(key, model.preflop(at, data.strategy));
    return bent.get(key);
  }

  // A node's solved data ({ strategy, loss, exact }), with the raises cut to the strongest hands while limpers
  // are in and nobody has raised (cap: the share of all hands that still raise). Cached per node and cap.
  const cut = new Map();
  function dataFor(at) {
    const data = chart.dataAt(at);
    if (!data || raises > 0 || limpers.size === 0 || at.level !== 0) return data;
    const cap = limpedCap(limpers.size);
    const key = `${at.id}|${cap}`;
    if (!cut.has(key)) {
      const A = at.actions.length;
      const raiseAt = at.actions.map((a, k) => (isRaise(a.type) ? k : -1)).filter((k) => k >= 0);
      const passiveAt = at.actions.map((a, k) => (isRaise(a.type) ? -1 : k)).filter((k) => k >= 0);
      const strategy = Float32Array.from(data.strategy);
      const loss = Float32Array.from(data.loss);
      for (let c = 0; c < N; c++) {
        const keep = insideTop(c, cap);
        if (keep >= 1) continue;
        // The passive play this class falls back to: the one the solution values most.
        const passive = passiveAt.reduce((best, k) => (data.loss[k * N + c] < data.loss[best * N + c] ? k : best), passiveAt[0]);
        let moved = 0;
        for (const k of raiseAt) {
          moved += (1 - keep) * data.strategy[k * N + c];
          strategy[k * N + c] = keep * data.strategy[k * N + c];
        }
        strategy[passive * N + c] += moved;
        const base = data.loss[passive * N + c];
        for (let k = 0; k < A; k++) {
          const cutLoss = k === passive ? 0 : raiseAt.includes(k) ? LIMPED_MARGIN : Math.max(0, data.loss[k * N + c] - base);
          loss[k * N + c] = keep * data.loss[k * N + c] + (1 - keep) * cutLoss;
        }
        let best = Infinity;
        for (let k = 0; k < A; k++) best = Math.min(best, loss[k * N + c]);
        for (let k = 0; k < A; k++) loss[k * N + c] -= best;
      }
      cut.set(key, { strategy, loss, exact: false, cap });
    }
    return cut.get(key);
  }

  // Narrow a range (169 weights) by how often each class takes action `index` at node `at`, played by `seat`.
  function narrow(row, at, index, seat) {
    const data = dataFor(at);
    if (!data) return;
    const strategy = strategyAt(at, data, seat);
    let before = 0;
    let after = 0;
    for (let c = 0; c < N; c++) {
      before += CLASS_COMBOS[c] * row[c];
      after += CLASS_COMBOS[c] * row[c] * strategy[index * N + c];
    }
    const floor = after < OFF_STRATEGY * before ? FLOOR : 0;
    for (let c = 0; c < N; c++) row[c] *= strategy[index * N + c] + floor;
  }

  // Take tree action `index` at the current node.
  function take(index) {
    narrow(reach[node.player], node, index, node.player);
    node = node.children[index];
  }

  // Tree players who come before `seat` but didn't act in the real hand folded.
  function foldUpTo(seat) {
    while (node.kind === 'decision' && node.player !== seat) {
      const fold = node.actions.findIndex((a) => a.type === 'fold');
      if (fold < 0) return false;
      take(fold);
    }
    return node.kind === 'decision';
  }

  // Where `seat` opens with everyone before them folded.
  function unopened(seat) {
    let at = root;
    while (at.kind === 'decision' && at.player !== seat) at = at.children[at.actions.findIndex((a) => a.type === 'fold')];
    return at;
  }

  // The tree's limped pot: the small blind limps, then `types` in turn (big blind, small blind, ...).
  function limpedPot(...types) {
    let at = unopened(SB);
    at = at.children[at.actions.findIndex((a) => a.type === 'call')];
    for (const type of types) at = at.children[at.actions.findIndex((a) => (type === 'raise' ? isRaise(a.type) : a.type === type))];
    return at;
  }

  // A limper's range: the opening range of a seat further on, with fewer premiums.
  function limpRange(seat) {
    const at = unopened(Math.min(BUTTON, Math.max(0, seat) + LIMP_WIDER_BY));
    const data = chart.dataAt(at);
    const raiseAt = at.actions.map((a, k) => (isRaise(a.type) ? k : -1)).filter((k) => k >= 0);
    return Float32Array.from({ length: N }, (_, c) => limpKeep(c) * raiseAt.reduce((sum, k) => sum + data.strategy[k * N + c], 0));
  }

  // A limper facing more than one raise: keep the band of their range (strongest first) that takes `type`.
  function narrowByStrength(row, type) {
    let total = 0;
    for (let c = 0; c < N; c++) total += CLASS_COMBOS[c] * row[c];
    let seen = 0;
    for (const c of BY_STRENGTH) {
      const weight = CLASS_COMBOS[c] * row[c];
      const middle = total > 0 ? (seen + weight / 2) / total : 1;
      seen += weight;
      const band = middle < VS_RERAISE.raise ? 'raise' : middle < VS_RERAISE.raise + VS_RERAISE.call ? 'call' : 'fold';
      if (band !== (isRaise(type) ? 'raise' : type)) row[c] *= FLOOR;
    }
  }

  // Moves to `position`'s turn (folding anyone in between). False if there's no node to play it from.
  function moveTo(position) {
    current = null;
    missing = null;
    if (lost) return false;
    const seat = seatOf.get(position);
    if (limpers.has(position)) {
      // A limper facing one raise (or playing out their own re-raise): the stand-in's small blind.
      if (standIn?.node.kind === 'decision' && standIn.node.player === SB && (raises === 1 || standIn.limper === position)) current = standIn.node;
      else missing = "A limper facing a raise and a re-raise isn't part of the solved game.";
      currentSeat = seat;
      return current !== null;
    }
    if (seat === undefined || seat < 0) return false;
    currentSeat = seat;
    if (standIn?.node.kind === 'decision' && standIn.node.player === BB && standIn.raiser === position) {
      current = standIn.node;
      return true;
    }
    if (foldUpTo(seat)) {
      current = node;
      return true;
    }
    // Only limpers came in and everyone else folded: the big blind checks or raises them like a small-blind limp.
    if (seat === BB && raises === 0 && limpers.size > 0) {
      standIn = { node: limpedPot(), raiser: position, limper: null };
      current = standIn.node;
      return true;
    }
    lost = 'The preflop action goes beyond what the solved game covers.';
    return false;
  }

  // A real action by a limper (they're off the tree).
  function limperActs(position, real) {
    const row = limpers.get(position);
    if (real.type === 'fold') {
      limpers.delete(position);
      return { real };
    }
    if (moveTo(position)) {
      const match = matchAction(current, real, chart.config.stack);
      narrow(row, current, match.index, currentSeat);
      if (isRaise(real.type)) standIn = { ...standIn, node: current.children[match.index], limper: position };
    } else {
      // A re-raise from here leaves the other players in spots the tree doesn't have.
      narrowByStrength(row, real.type);
      if (isRaise(real.type)) lost = 'A limper re-raised a re-raise, which goes beyond the solved game.';
    }
    if (isRaise(real.type)) raises += 1;
    return { real };
  }

  return {
    // The node advice was last given from (the tree's own, or a stand-in).
    get node() {
      return current ?? node;
    },
    get lost() {
      return lost;
    },
    // Why there's no advice for the last player moved to, when it isn't that the hand was lost.
    get missing() {
      return missing;
    },
    moveTo,
    // A real action by `position`. real: { type, to (bb) }. Returns { real, note } or null if it couldn't be followed.
    apply(position, real) {
      if (lost) return null;
      const seat = seatOf.get(position);
      // A limp (the small blind's is in the tree): off the tree from here on.
      if (raises === 0 && real.type === 'call' && seat !== SB && seat !== BB && !limpers.has(position)) {
        if (seat >= 0) {
          if (!moveTo(position)) return null;
          take(node.actions.findIndex((a) => a.type === 'fold'));
        }
        limpers.set(position, limpRange(seat));
        return { real, note: 'limp' };
      }
      if (limpers.has(position)) return limperActs(position, real);
      if (seat === -1) {
        // A left-out seat (9-handed table): only its fold is expected.
        if (real.type !== 'fold') lost = 'Too many players for the 8-handed solution.';
        return null;
      }
      if (!moveTo(position)) return null;
      const match = matchAction(current, real, chart.config.stack);
      if (match.index < 0) {
        lost = 'This action has no match in the solved game.';
        return null;
      }
      const inTree = current === node;
      if (inTree) {
        if (match.note === 'call') {
          lost = 'More players called than the solved game allows (it covers pots of up to three players).';
          return null;
        }
        take(match.index);
      } else {
        // A stand-in decision narrows this player's range, and the stand-in moves on.
        narrow(reach[seat], current, match.index, seat);
        standIn.node = current.children[match.index];
      }
      if (isRaise(real.type)) {
        raises += 1;
        // The first raise over limpers: they answer it like the small blind answers the big blind's raise.
        if (inTree && limpers.size > 0) standIn = raises === 1 ? { node: limpedPot('raise'), raiser: position, limper: null } : null;
      }
      return { real, note: match.note };
    },
    // GTO for one hand class at the current spot (call moveTo first). Returns { node, actions,
    // strategy: [share per action], loss: [bb per action, 0 = best], exact } or null.
    advice(cls) {
      const at = current;
      if (!at || at.kind !== 'decision') return null;
      const data = dataFor(at);
      if (!data) return null;
      const A = at.actions.length;
      const loss = lockedLosses(at, cls, Array.from({ length: A }, (_, a) => data.loss[a * N + cls]));
      const strategy = strategyAt(at, data, currentSeat);
      // A limper still in the hand isn't part of the tree, so the spot is approximate.
      const limped = limpers.size > 0;
      return {
        node: at,
        actions: at.actions,
        strategy: Array.from({ length: A }, (_, a) => strategy[a * N + cls]),
        loss,
        exact: data.exact && at === node && !limped,
        note: limped ? "limped pots aren't in the solved charts, so this is the closest solved spot, adjusted for the limpers" : null,
      };
    },
    // A position's range right now as 169 class weights (1 = always here with that class).
    rangeOf(position) {
      if (limpers.has(position)) return limpers.get(position);
      const seat = seatOf.get(position);
      return seat >= 0 ? reach[seat] : null;
    },
  };
}
