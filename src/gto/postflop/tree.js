// The game tree of a postflop solve: from the start of one street to the end of the hand, for 2 or more
// players (seat 0 acts first, the last seat is the button side).
//
//   decision  { type: DECISION, player, actions: [{ type, to }], children }   to = the player's street total
//   chance    { type: CHANCE, street, cards: [card ids], children }           the next card (sampled, see solver.js)
//   fold      { type: FOLD, winner, pot, invested }                           everyone else folded
//   showdown  { type: SHOWDOWN, pot, invested, alive, board }                 5 cards out, best hand wins
// invested: what each player put in during this solve (the starting pot is dead money that the winner takes).
//
// The street being solved can carry the hand's real actions (`path`): any real bet size that isn't in the menu
// is added at that spot, so the solve values exactly what was done. Later streets only get betting while
// `bettingStreets` lasts; after that the cards are dealt out with no more betting (the hand is checked down).
import { menuFor, STREETS, ALL_IN_MAX_POTS, FORCE_ALL_IN_SHARE } from './sizes.js';

export const DECISION = 0;
export const CHANCE = 1;
export const FOLD = 2;
export const SHOWDOWN = 3;

const round = (n) => Math.round(n * 100) / 100;
const STREET_OF_BOARD = { 3: 0, 4: 1, 5: 2 };

// spec: {
//   board: card ids (3-5), pot, stacks: chips behind per player at the start of the street,
//   path: real actions this street [{ player, type: fold|check|call|bet|raise|allin, to }],
//   bettingStreets: streets with betting, counting this one (default: all that are left),
//   deal(board) -> card ids to branch on for the next card (sampled by the solver),
//   detail: 'full' | 'fast', minBet: smallest bet (1 big blind)
// }
// Returns { root, decisions (all decision nodes), count (nodes) }.
export function buildPostflopTree(spec) {
  const P = spec.stacks.length;
  const minBet = spec.minBet ?? 1;
  const rootStreet = STREET_OF_BOARD[spec.board.length];
  const bettingStreets = spec.bettingStreets ?? 3 - rootStreet;
  const path = spec.path ?? [];
  const decisions = [];
  let count = 0;

  const startState = () => ({
    street: rootStreet,
    board: [...spec.board],
    pot: spec.pot,
    invested: new Array(P).fill(0),
    streetBet: new Array(P).fill(0),
    stack: [...spec.stacks],
    folded: new Array(P).fill(false),
    allIn: spec.stacks.map((s) => s <= 0),
    currentBet: 0,
    lastRaise: 0,
    bets: 0,
    queue: [...Array(P).keys()].filter((p) => spec.stacks[p] > 0),
    bettingLeft: bettingStreets,
    pathAt: 0, // how much of the real path this node is on (-1 once off it)
  });

  const clone = (s) => ({
    ...s,
    board: [...s.board],
    invested: [...s.invested],
    streetBet: [...s.streetBet],
    stack: [...s.stack],
    folded: [...s.folded],
    allIn: [...s.allIn],
    queue: [...s.queue],
  });
  const alivePlayers = (s) => [...Array(P).keys()].filter((p) => !s.folded[p]);

  // The most player p can usefully put in this street (nobody can call more than their own stack).
  function maxTo(s, p) {
    const mine = s.streetBet[p] + s.stack[p];
    let theirs = 0;
    for (const o of alivePlayers(s)) if (o !== p) theirs = Math.max(theirs, s.streetBet[o] + s.stack[o]);
    return round(Math.min(mine, theirs));
  }

  // The actions player p can take in state s.
  function actionsFor(s, p) {
    const toCall = round(s.currentBet - s.streetBet[p]);
    const cap = maxTo(s, p);
    const menu = menuFor({ players: alivePlayers(s).length, street: STREETS[s.street], isRoot: s.street === rootStreet, detail: spec.detail });
    const first = s.bets === 0 && alivePlayers(s).filter((o) => !s.allIn[o])[0] === p;
    const potAfterCall = s.pot + Math.max(0, toCall);
    const sizeTo = (to) => {
      to = round(to);
      const minTo = round(s.currentBet + Math.max(s.lastRaise, minBet));
      if (to < minTo) to = minTo;
      if (to >= cap || to - s.streetBet[p] >= FORCE_ALL_IN_SHARE * (cap - s.streetBet[p])) return { type: 'allin', to: cap };
      return { type: s.currentBet > 0 ? 'raise' : 'bet', to };
    };

    const actions = [];
    if (toCall <= 0) {
      actions.push({ type: 'check', to: s.streetBet[p] });
    } else {
      actions.push({ type: 'fold', to: s.streetBet[p] });
      actions.push({ type: 'call', to: round(Math.min(s.currentBet, s.streetBet[p] + s.stack[p])) });
    }
    const canRaise = cap > s.currentBet && s.stack[p] > toCall && s.bets < menu.maxBets && alivePlayers(s).some((o) => o !== p && !s.allIn[o]);
    if (canRaise) {
      // Sized bets and raises, below the last level of the street (that one is all in only).
      if (s.bets < menu.maxBets - 1) {
        if (s.currentBet === 0) {
          for (const f of first ? menu.first : menu.later) actions.push(sizeTo(f * s.pot));
        } else {
          const facing = s.currentBet - s.streetBet[p];
          for (const x of menu.raise) actions.push(sizeTo(s.currentBet + (x - 1) * facing));
        }
      }
      // All in, when it isn't a giant overbet (always on the river, where jams are standard).
      if (menu.allInAlways || cap - s.currentBet <= ALL_IN_MAX_POTS * potAfterCall) actions.push({ type: 'allin', to: cap });
    }
    // No duplicates (several sizes can turn into the same all in).
    const seen = new Set();
    return actions.filter((a) => {
      const tag = a.type === 'allin' ? 'allin' : `${a.type}:${a.to}`;
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
  }

  // Make sure the real action at this spot is one of the options (adding the exact size if needed).
  // Returns the index of the matching action.
  function placeRealAction(s, p, actions, real) {
    const close = (a, b) => Math.abs(a - b) <= Math.max(0.05, 0.015 * s.pot);
    let type = real.type;
    if (type === 'bet' || type === 'raise' || type === 'allin') {
      const cap = maxTo(s, p);
      const to = type === 'allin' ? cap : Math.min(round(real.to), cap);
      if (to <= s.currentBet) type = s.currentBet > s.streetBet[p] ? 'call' : 'check';
      else {
        const jam = to >= cap - 0.005;
        const found = actions.findIndex((a) => (jam ? a.type === 'allin' : (a.type === 'bet' || a.type === 'raise') && close(a.to, to)));
        if (found >= 0) return found;
        actions.push(jam ? { type: 'allin', to: cap } : { type: s.currentBet > 0 ? 'raise' : 'bet', to });
        return actions.length - 1;
      }
    }
    const found = actions.findIndex((a) => a.type === type);
    if (found >= 0) return found;
    // A check where only call/fold exist (or the reverse) can't happen in a consistent log: take the passive option.
    return actions.findIndex((a) => a.type === (s.currentBet > s.streetBet[p] ? 'call' : 'check'));
  }

  // Apply player p's action to a copy of the state.
  function apply(s0, p, action) {
    const s = clone(s0);
    s.queue = s.queue.filter((q) => q !== p);
    if (action.type === 'fold') {
      s.folded[p] = true;
      return s;
    }
    if (action.type === 'check') return s;
    const add = round(action.to - s.streetBet[p]);
    s.streetBet[p] = action.to;
    s.invested[p] = round(s.invested[p] + add);
    s.stack[p] = round(s.stack[p] - add);
    s.pot = round(s.pot + add);
    if (s.stack[p] <= 0.001) s.allIn[p] = true;
    if (action.to > s.currentBet) {
      s.lastRaise = Math.max(s.lastRaise, round(action.to - s.currentBet));
      s.currentBet = action.to;
      s.bets += 1;
      // Everyone else still able to act gets to respond, in order after p.
      const order = [];
      for (let k = 1; k < P; k++) {
        const q = (p + k) % P;
        if (!s.folded[q] && !s.allIn[q]) order.push(q);
      }
      s.queue = order;
    }
    return s;
  }

  // The next street: reset the betting and deal.
  function nextStreetState(s, card) {
    const n = clone(s);
    n.street += 1;
    n.board.push(card);
    n.streetBet.fill(0);
    n.currentBet = 0;
    n.lastRaise = 0;
    n.bets = 0;
    n.bettingLeft -= 1;
    n.pathAt = -1;
    const canAct = [...Array(P).keys()].filter((p) => !n.folded[p] && !n.allIn[p]);
    n.queue = canAct.length >= 2 && n.bettingLeft > 0 ? canAct : [];
    return n;
  }

  function leaf(s, type, extra) {
    count++;
    return { type, pot: s.pot, invested: Float64Array.from(s.invested), ...extra };
  }

  function build(s) {
    const alive = alivePlayers(s);
    if (alive.length === 1) return leaf(s, FOLD, { winner: alive[0] });
    const next = s.queue[0];
    if (next === undefined) {
      // Betting on this street is over.
      if (s.street === 2) return leaf(s, SHOWDOWN, { alive: Uint8Array.from({ length: P }, (_, p) => (s.folded[p] ? 0 : 1)), board: s.board });
      const cards = spec.deal(s.board);
      count++;
      const node = { type: CHANCE, street: s.street + 1, cards, children: [] };
      node.children = cards.map((card) => build(nextStreetState(s, card)));
      return node;
    }
    count++;
    const actions = actionsFor(s, next);
    const node = {
      type: DECISION,
      player: next,
      actions,
      children: [],
      street: s.street,
      pot: s.pot,
      toCall: round(s.currentBet - s.streetBet[next]),
      invested: Float64Array.from(s.invested),
    };
    // On the real line: onPath = how many real actions came before this spot (the last one is where the
    // hand is now); realIndex = the action the hand really took here.
    let realIndex = -1;
    if (s.pathAt >= 0) {
      node.onPath = s.pathAt;
      if (s.pathAt < path.length) {
        const real = path[s.pathAt];
        if (real.player !== next) throw new Error(`The hand's order doesn't match the solver (expected seat ${next}, got ${real.player}).`);
        realIndex = placeRealAction(s, next, actions, real);
        node.realIndex = realIndex;
      }
    }
    decisions.push(node);
    node.children = actions.map((action, index) => {
      const child = apply(s, next, action);
      child.pathAt = index === realIndex ? s.pathAt + 1 : -1;
      return build(child);
    });
    return node;
  }

  const root = build(startState());
  return { root, decisions, count };
}
