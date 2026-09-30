// Prepares any hand saved in Hands for the coach. Hands recorded with the current recorder already have
// seats and stacks; older hands (and the samples) only have the action log, so the missing pieces are
// rebuilt from it and every guess is listed, so the report can say exactly what it assumed:
//   players  from who acted (anyone who never acted folded before the action)
//   stacks   100 big blinds, or what went in plus 50 bb when more went in, and exactly all-in for shoves
//   reads    saved coach reads (coachReads) if you set them before, otherwise average regulars
import { STAKES, TABLE_POSITIONS } from '../constants/poker.js';
import { createHand, applyAction, dealBoard, currentPlayer } from '../utils/handEngine.js';
import { formatMoney } from '../utils/format.js';
import { actionType, replayHand } from './replay.js';

const NINE_MAX_ONLY = ['UTG+1', 'MP', 'LJ'];
const BOARD_SIZE = { Preflop: 0, Flop: 3, Turn: 4, River: 5 };
const BOTTOMLESS = 1e7; // stack used while measuring how much each player put in
const ORDER_ERROR = "This hand's action log doesn't follow the betting order, so the coach can't replay it.";

// Quick check (no replay) for buttons: can the coach look at this hand at all?
export function coachSupport(hand) {
  if (hand.game && hand.game !== 'NLH') return { ok: false, reason: "The coach reviews No-Limit Hold'em hands only for now." };
  if (hand.holeCards?.length !== 2) return { ok: false, reason: 'The coach needs your two hole cards.' };
  return { ok: true, reason: null };
}

// "$1/$2" -> { label, sb, bb }
function stakesOf(label) {
  const known = STAKES.find((s) => s.label === label);
  if (known) return { label: known.label, sb: known.sb, bb: known.bb };
  const parsed = /\$?([\d.]+)\/\$?([\d.]+)/.exec(label ?? '');
  return parsed ? { label, sb: Number(parsed[1]), bb: Number(parsed[2]) } : null;
}

// Players from the saved hand, or (older hands) everyone who acted in the log, in order of appearance.
function playersOf(hand) {
  if (hand.players?.length) return { players: hand.players, derived: false };
  const actors = [];
  for (const street of hand.streets) {
    for (const action of street.actions) {
      if (action.actor !== 'Hero' && !actors.includes(action.actor)) actors.push(action.actor);
    }
  }
  return {
    players: [
      { position: hand.heroPosition, role: 'hero', cards: hand.holeCards },
      ...actors.map((position) => ({ position, role: 'villain', cards: [] })),
    ],
    derived: true,
  };
}

// Replay with bottomless stacks to see how much each player put in, and exactly where anyone shoved.
function measureCommitment(record) {
  const shoved = new Map();
  let state = createHand({
    players: record.players.map(({ seat, position, role, name }) => ({ seat, position, role, name, stack: BOTTOMLESS })),
    positions: record.positions,
    sb: record.stakes.sb,
    bb: record.stakes.bb,
  });
  record.streets.forEach((street, index) => {
    if (index > 0) state = dealBoard(state, record.board.slice(state.board.length, BOARD_SIZE[street.name]));
    for (const action of street.actions) {
      const actor = currentPlayer(state);
      if (!actor || (actor.role === 'hero' ? 'Hero' : actor.position) !== action.actor) throw new Error(ORDER_ERROR);
      let type = actionType(action);
      const wentAllIn = type === 'allin' || action.allIn;
      // With bottomless stacks an all-in is just a bet/raise to the logged amount (or a call).
      if (type === 'allin') type = (action.amount ?? 0) <= state.currentBet ? 'call' : 'raise';
      state = applyAction(state, { type, amount: action.amount });
      if (wentAllIn) shoved.set(actor.seat, state.players.find((p) => p.seat === actor.seat).invested);
    }
  });
  return { invested: new Map(state.players.map((p) => [p.seat, p.invested])), shoved };
}

// Returns { record, assumptions: [{ id, text }] } ready for analyzeHand, or { error }.
export function prepareSavedHand(hand) {
  const support = coachSupport(hand);
  if (!support.ok) return { error: support.reason };
  const stakes = stakesOf(hand.stakes);
  if (!stakes) return { error: "The coach couldn't read this hand's stakes." };

  const { players, derived } = playersOf(hand);
  const tableSize = hand.tableSize ?? (players.some((p) => NINE_MAX_ONLY.includes(p.position)) ? 9 : 6);
  const positions = TABLE_POSITIONS[tableSize];
  if (players.some((p) => !positions.includes(p.position))) return { error: "This hand's seats don't fit a 6-max or 9-max table." };

  // Reads saved from an earlier coach review win over reads stored with the hand.
  const reads = hand.coachReads ?? {};
  const seated = players.map((p) => ({
    seat: p.seat ?? positions.indexOf(p.position),
    position: p.position,
    role: p.role,
    name: p.role === 'hero' ? 'You' : p.position,
    stack: p.stack > 0 ? p.stack : null,
    cards: p.cards ?? [],
    profile: reads[p.role === 'hero' ? 'hero' : p.position] ?? p.profile ?? null,
  }));
  const hero = seated.find((p) => p.role === 'hero');
  if (!hero) return { error: 'The coach needs to know which seat was yours.' };

  const record = {
    stakes,
    tableSize,
    positions,
    heroSeat: hero.seat,
    players: seated,
    streets: hand.streets,
    board: hand.board ?? [],
    winners: [],
    result: hand.result,
    pot: hand.potSize,
  };
  const assumptions = [];

  // Stacks: recorded ones stay; missing ones are rebuilt from how much went in.
  if (seated.some((p) => !p.stack)) {
    let commitment;
    try {
      commitment = measureCommitment(record);
    } catch {
      return { error: ORDER_ERROR };
    }
    const guesses = [];
    for (const player of seated) {
      if (player.stack) continue;
      const shove = commitment.shoved.get(player.seat);
      // Players who didn't shove had chips behind: what went in plus 50 bb, rounded up to 50 bb.
      const withRoom = Math.ceil(((commitment.invested.get(player.seat) ?? 0) + 50 * stakes.bb) / (50 * stakes.bb)) * 50 * stakes.bb;
      player.stack = shove ?? Math.max(100 * stakes.bb, withRoom);
      guesses.push(`${player.name} ${formatMoney(player.stack, { sign: false })}${shove ? ' (all in)' : ''}`);
    }
    assumptions.push({
      id: 'stacks',
      text: `Stacks weren't recorded, so the coach assumed ${guesses.join(', ')}: 100 big blinds (more when more went in), and exactly all in for shoves.`,
    });
  }
  if (derived) {
    assumptions.push({ id: 'players', text: 'Players were read from the action log. Anyone who never acted is treated as folded before the action.' });
  }
  assumptions.push({ id: 'reads', text: 'No reads were set, so villains are treated as average regulars. Pick a player type below to see how the verdict changes.' });

  // Last check: the log must replay cleanly with these stacks.
  try {
    replayHand(record, () => {});
  } catch {
    return { error: ORDER_ERROR };
  }
  return { record, assumptions };
}
