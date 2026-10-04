// The preflop game the GTO engine solves: 8-handed No-Limit Hold'em at one stack depth (in big blinds), with
// the bet sizes real players use, and at most three players seeing a flop (heads-up and 3-way pots).
//
//   Opening        UTG..BTN open to 2.5 bb (2.2 at 25-39 bb, 2 below that); the SB raises to 3 bb or limps.
//                  Everyone folds to the BB: the BB wins. SB limps: the BB checks or raises to 3.5 bb.
//   vs an open     fold, call (at most two callers), or 3-bet: 3x in position, 3.75x from the blinds,
//                  plus one open size per caller (a squeeze).
//   vs a 3-bet     the opener and callers fold, call or 4-bet (2.3x); players yet to act fold or 4-bet.
//   vs a 4-bet     fold, call (heads-up only) or 5-bet all in.
//   vs all in      fold or call.
// Any raise to 45% of the stack or more is an all-in instead, and at 40 bb or less every raise spot (opening
// included) also has an all-in option. A hand ends preflop when everyone folds, or reaches a terminal where 2-3 players see a flop
// (or a showdown, when someone is all in).
export const POSITIONS = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const PLAYERS = POSITIONS.length;
export const SB = 6;
export const BB = 7;
// Postflop order: the blinds act first, the button last.
export const POSTFLOP_ORDER = [SB, BB, 0, 1, 2, 3, 4, 5];

const round = (n) => Math.round(n * 100) / 100;

function openSize(stack, player) {
  if (player === SB) return stack >= 40 ? 3 : stack >= 25 ? 2.7 : 2.5;
  return stack >= 40 ? 2.5 : stack >= 25 ? 2.2 : 2;
}

// Build the tree for one stack depth (and big-blind ante, in big blinds: dead money in the pot). The same
// arguments always give the same tree with the same node ids, which is how solved charts are matched to nodes.
// Returns { root, decisions, terminals, stack, ante }.
// Decision: { kind: 'decision', id, player, key, actions: [{ type, to }], children, parent, invested: number[8] }
// Terminal: { kind: 'fold' | 'flop' | 'allin', id, key, invested: number[8], players: [seats in the pot],
//             pot (everything in the middle, ante included), winner? (fold) }
// key: the action history, e.g. "UTG:f|UTG+1:r2.5|LJ:c" (r = raise to, a = all in, f/c/k = fold/call/check).
export function buildPreflopTree(stack, ante = 0) {
  const decisions = [];
  const terminals = [];

  // Everything about the hand so far that decides what can happen next.
  function makeState() {
    const invested = new Array(PLAYERS).fill(0);
    invested[SB] = 0.5;
    invested[BB] = 1;
    return {
      invested,
      folded: new Array(PLAYERS).fill(false),
      allIn: new Array(PLAYERS).fill(false),
      voluntary: new Array(PLAYERS).fill(false), // acted and stayed in (blinds count once they act)
      currentBet: 1,
      level: 0, // 0 nothing yet (blinds), 1 open (or the BB raising a limp), 2 3-bet, 3 4-bet, 4 all in
      limped: false,
      aggressor: null,
      queue: [0, 1, 2, 3, 4, 5, 6, 7],
      key: '',
    };
  }

  const clone = (s) => ({ ...s, invested: [...s.invested], folded: [...s.folded], allIn: [...s.allIn], voluntary: [...s.voluntary], queue: [...s.queue] });
  const inPot = (s) => POSITIONS.map((_, p) => p).filter((p) => !s.folded[p] && s.voluntary[p]);

  function terminalFrom(state, kind, extra = {}) {
    const pot = round(state.invested.reduce((sum, x) => sum + x, 0) + ante);
    const node = { kind, id: terminals.length, key: state.key, invested: [...state.invested], players: inPot(state), pot, ...extra };
    terminals.push(node);
    return node;
  }

  // After a raise by player p, everyone else still in (and not all in) acts again, in order after p.
  function queueAfterRaise(state, p) {
    const order = [];
    for (let k = 1; k < PLAYERS; k++) {
      const q = (p + k) % PLAYERS;
      if (!state.folded[q] && !state.allIn[q]) order.push(q);
    }
    return order;
  }

  // The actions player p can take here.
  function actionsFor(state, p) {
    const toCall = round(state.currentBet - state.invested[p]);
    const others = inPot(state).filter((q) => q !== p);
    const playersIfIn = others.length + 1;
    const raiseTo = (to) => (to >= 0.45 * stack ? { type: 'allin', to: stack } : { type: 'raise', to: round(to) });
    const actions = [];

    if (state.level === 0) {
      // Unopened. The BB only acts after an SB limp. Short stacks can also open all in.
      if (p === BB) {
        actions.push({ type: 'check', to: 1 });
        actions.push(raiseTo(3.5));
      } else {
        actions.push({ type: 'fold' });
        if (p === SB) actions.push({ type: 'call', to: 1 });
        actions.push(raiseTo(openSize(stack, p)));
      }
      if (stack <= 40) actions.push({ type: 'allin', to: stack });
    } else {
      actions.push({ type: 'fold' });
      if (state.level === 1) {
        const callers = others.filter((q) => q !== state.aggressor).length;
        if (playersIfIn <= 3 && toCall > 0) actions.push({ type: 'call', to: state.currentBet });
        const blind = p === SB || p === BB;
        actions.push(raiseTo(state.currentBet * (blind ? 3.75 : 3) + callers * state.currentBet));
      } else if (state.level === 2) {
        if (state.voluntary[p] && playersIfIn <= 3) actions.push({ type: 'call', to: state.currentBet });
        actions.push(raiseTo(state.currentBet * 2.3));
      } else if (state.level === 3) {
        if (state.voluntary[p] && playersIfIn <= 2) actions.push({ type: 'call', to: state.currentBet });
        actions.push({ type: 'allin', to: stack });
      } else if (playersIfIn <= 3) {
        actions.push({ type: 'call', to: Math.min(stack, state.currentBet) });
      }
      // Short stacks: an all-in option wherever there's a smaller raise.
      if (stack <= 40 && actions.some((a) => a.type === 'raise')) actions.push({ type: 'allin', to: stack });
    }

    // No duplicate all-ins, and no raise that isn't bigger than the current bet.
    const seen = new Set();
    return actions.filter((a) => {
      if (a.type === 'raise' && a.to <= state.currentBet) return false;
      const tag = a.type === 'allin' ? 'allin' : `${a.type}:${a.to ?? ''}`;
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
  }

  const label = (p, a) => `${POSITIONS[p]}:${a.type === 'raise' ? `r${a.to}` : a.type === 'allin' ? 'a' : a.type === 'check' ? 'k' : a.type[0]}`;

  // Apply player p's action to a copy of the state.
  function apply(state, p, action) {
    const s = clone(state);
    s.queue = s.queue.filter((q) => q !== p);
    s.key = s.key ? `${s.key}|${label(p, action)}` : label(p, action);
    if (action.type === 'fold') {
      s.folded[p] = true;
      return s;
    }
    s.voluntary[p] = true;
    if (action.type === 'check') return s;
    if (action.type === 'call') {
      s.invested[p] = Math.min(stack, s.currentBet);
      if (s.invested[p] >= stack) s.allIn[p] = true;
      if (s.level === 0) s.limped = true;
      return s;
    }
    // Raise or all in.
    s.invested[p] = Math.min(stack, action.to);
    if (s.invested[p] >= stack) s.allIn[p] = true;
    s.currentBet = Math.max(s.currentBet, s.invested[p]);
    s.level = action.type === 'allin' ? 4 : Math.min(4, s.level + 1);
    s.aggressor = p;
    s.queue = queueAfterRaise(s, p);
    return s;
  }

  // Who acts next, or how the hand ends.
  function build(state) {
    const live = POSITIONS.map((_, p) => p).filter((p) => !state.folded[p]);
    if (live.length === 1) return terminalFrom(state, 'fold', { winner: live[0] });
    // Everyone folded to the BB with no raise and no limp: the BB wins without acting.
    if (state.level === 0 && !state.limped && state.queue.length === 1 && state.queue[0] === BB) {
      return terminalFrom(state, 'fold', { winner: BB });
    }
    const next = state.queue.find((p) => !state.folded[p] && !state.allIn[p]);
    if (next === undefined) {
      const kind = inPot(state).some((p) => state.allIn[p]) ? 'allin' : 'flop';
      return terminalFrom(state, kind);
    }
    const node = {
      kind: 'decision',
      id: decisions.length,
      player: next,
      key: state.key,
      actions: actionsFor(state, next),
      children: [],
      invested: [...state.invested],
      currentBet: state.currentBet,
      level: state.level,
    };
    decisions.push(node);
    node.children = node.actions.map((action) => {
      const child = build(apply(state, next, action));
      child.parent = node;
      return child;
    });
    return node;
  }

  const root = build(makeState());
  root.parent = null;
  return { root, decisions, terminals, stack, ante };
}
