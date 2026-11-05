// What kind of spot a decision is. One labelling, shared by everything that talks about "spots": the leak report
// groups your decisions by it, Practice drills the kind you ask for, and the decision sheets name it.
//
// A spot is read from the hand engine's state at the moment you act (src/utils/handEngine.js):
//   area       which of the AREAS it falls in ("vs-open", "flop-vs-bet" ...)
//   position   your seat
//   potType    postflop: limped | srp (single-raised) | 3bet | 4bet (or more)
//   role       postflop: aggressor (you made the last preflop raise) | caller | none (limped pot)
//   ip         postflop: you act last
//   players    how many are still in the hand
// plus, for the preflop areas, who opened (opener) and how many callers are in (callers).
import { preflopRaises } from '../utils/handEngine.js';
import { isInPosition } from './replay.js';

// The places a decision can come up, in the order a hand goes. "bet" areas are your turn with nothing to call
// (first to act, or checked to); "vs-bet" areas are facing a bet or raise.
export const AREAS = [
  { id: 'open', street: 'Preflop', name: 'Opening the pot', short: 'Opening', kind: 'first in', verb: 'open' },
  { id: 'limped', street: 'Preflop', name: 'Limped pots', short: 'Limped pots', kind: 'limpers in', verb: 'play against limpers' },
  { id: 'vs-open', street: 'Preflop', name: 'Facing an open raise', short: 'Facing opens', kind: 'facing a raise', verb: 'defend against an open' },
  { id: 'vs-3bet', street: 'Preflop', name: 'Facing a 3-bet', short: 'Facing 3-bets', kind: 'facing a re-raise', verb: 'answer a 3-bet' },
  { id: 'vs-4bet', street: 'Preflop', name: 'Facing a 4-bet', short: 'Facing 4-bets', kind: 'facing a 4-bet', verb: 'answer a 4-bet' },
  { id: 'flop-bet', street: 'Flop', name: 'Betting the flop', short: 'Flop bets', kind: 'nothing to call', verb: 'bet the flop' },
  { id: 'flop-vs-bet', street: 'Flop', name: 'Facing a flop bet', short: 'Facing flop bets', kind: 'facing a bet', verb: 'answer a flop bet' },
  { id: 'turn-bet', street: 'Turn', name: 'Betting the turn', short: 'Turn bets', kind: 'nothing to call', verb: 'bet the turn' },
  { id: 'turn-vs-bet', street: 'Turn', name: 'Facing a turn bet', short: 'Facing turn bets', kind: 'facing a bet', verb: 'answer a turn bet' },
  { id: 'river-bet', street: 'River', name: 'Betting the river', short: 'River bets', kind: 'nothing to call', verb: 'bet the river' },
  { id: 'river-vs-bet', street: 'River', name: 'Facing a river bet', short: 'Facing river bets', kind: 'facing a bet', verb: 'answer a river bet' },
];
export const areaById = (id) => AREAS.find((a) => a.id === id) ?? null;

export const POT_TYPES = { limped: 'Limped pot', srp: 'Single-raised pot', '3bet': '3-bet pot', '4bet': '4-bet pot' };
const POT_OF_RAISES = ['limped', 'srp', '3bet', '4bet'];

// A logged preflop action that raised (a bet, a raise, a 3-bet..., or an all-in that wasn't just a call).
const raisedPreflop = (a) => a.verb.includes('raise') || a.verb.includes('-bets') || a.verb === 'all in';

// What kind of pot the flop was dealt in, and which side of it you are (the last preflop raiser, a caller, or
// nobody raised): readable as soon as the preflop is over.
export const potTypeOf = (state) => POT_OF_RAISES[Math.min(preflopRaises(state), 3)];
export function roleOf(state, heroSeat) {
  const hero = state.players.find((p) => p.seat === heroSeat);
  const lastRaiser = [...state.streets[0].actions].reverse().find(raisedPreflop);
  return !lastRaiser ? 'none' : lastRaiser.actor === (hero.role === 'hero' ? 'Hero' : hero.position) ? 'aggressor' : 'caller';
}

// The area, and the details around it, for the decision the player on the clock is about to make.
// state: the hand engine's state before the action; heroSeat: whose decision it is.
export function classifySpot(state, heroSeat) {
  const hero = state.players.find((p) => p.seat === heroSeat);
  const street = state.street;
  const toCall = state.currentBet - hero.streetBet;
  const players = state.players.filter((p) => !p.folded).length;
  const spot = { street, position: hero.position, players };

  if (street === 'Preflop') {
    const actions = state.streets[0].actions;
    const raises = preflopRaises(state);
    const firstRaise = actions.find(raisedPreflop);
    const lastRaiseAt = actions.map(raisedPreflop).lastIndexOf(true);
    spot.callers = actions.slice(lastRaiseAt + 1).filter((a) => a.verb === 'calls').length;
    if (raises === 0) {
      const limpers = actions.filter((a) => a.verb === 'calls').length;
      spot.area = limpers > 0 ? 'limped' : 'open';
      spot.limpers = limpers;
    } else {
      spot.area = raises === 1 ? 'vs-open' : raises === 2 ? 'vs-3bet' : 'vs-4bet';
      spot.opener = firstRaise.actor === 'Hero' ? hero.position : firstRaise.actor;
      spot.heroOpened = firstRaise.actor === 'Hero';
      spot.heroInPot = actions.some((a) => a.actor === 'Hero');
    }
    return spot;
  }

  // Postflop: who was the preflop aggressor, and what kind of pot is it?
  spot.potType = potTypeOf(state);
  spot.role = roleOf(state, heroSeat);
  spot.ip = isInPosition(state, heroSeat);
  const facing = toCall > 0;
  spot.area = `${street.toLowerCase()}-${facing ? 'vs-bet' : 'bet'}`;
  // Facing: a first bet, or a raise (you bet and were raised, or a raise over a bet). Betting: first to act, or checked to.
  spot.facingRaise = facing && state.raises >= 2;
  spot.checkedTo = !facing && state.streets.at(-1).actions.length > 0;
  return spot;
}

// A short name for the spot, as a player would say it: "BTN open", "BB vs BTN open", "Flop c-bet", "Facing a river bet".
export function spotTitle(spot) {
  const { area, position } = spot;
  if (area === 'open') return `${position} open`;
  if (area === 'limped') return `${position} vs ${spot.limpers === 1 ? 'a limper' : `${spot.limpers} limpers`}`;
  if (area === 'vs-open') return `${position} vs ${spot.opener} open${spot.callers ? ` + ${spot.callers === 1 ? 'a caller' : `${spot.callers} callers`}` : ''}`;
  if (area === 'vs-3bet') return spot.heroOpened ? `${position} open vs 3-bet` : `${position} vs 3-bet`;
  if (area === 'vs-4bet') return spot.heroOpened ? `${position} 3-bet vs 4-bet` : `${position} vs 4-bet`;
  const street = spot.street.toLowerCase();
  if (area.endsWith('-vs-bet')) {
    if (spot.facingRaise) return `Facing a ${street} raise`;
    return spot.role === 'caller' && street === 'flop' ? 'Facing a c-bet' : `Facing a ${street} bet`;
  }
  if (street === 'flop') {
    if (spot.role === 'aggressor') return 'Flop c-bet';
    return spot.ip ? 'Flop stab' : 'Flop lead';
  }
  return spot.checkedTo ? `${spot.street} bet after a check` : `${spot.street} lead`;
}

// Extra facts about a postflop spot, for chips next to the title: ["In position", "Heads-up", "3-bet pot"].
export function spotChips(spot) {
  if (spot.street === 'Preflop') return [];
  return [spot.ip ? 'In position' : 'Out of position', spot.players === 2 ? 'Heads-up' : `${spot.players}-way`, POT_TYPES[spot.potType]];
}

// ----- Hand families (the "what kind of hand" split) -----

const RANK_ORDER = 'AKQJT98765432';
const BROADWAY = new Set('AKQJT');

// Preflop: the family of a starting hand ("AKs" -> "Suited broadways").
export function handFamily(className) {
  const [a, b, suffix] = className;
  if (!suffix) return RANK_ORDER.indexOf(a) <= RANK_ORDER.indexOf('T') ? 'Big pairs' : 'Small pairs';
  const suited = suffix === 's';
  if (BROADWAY.has(a) && BROADWAY.has(b)) return suited ? 'Suited broadways' : 'Offsuit broadways';
  if (a === 'A') return suited ? 'Suited aces' : 'Offsuit aces';
  const gap = RANK_ORDER.indexOf(b) - RANK_ORDER.indexOf(a);
  if (suited && gap <= 3) return 'Suited connectors';
  return suited ? 'Other suited' : 'Other offsuit';
}
export const HAND_FAMILIES = ['Big pairs', 'Small pairs', 'Suited broadways', 'Offsuit broadways', 'Suited aces', 'Offsuit aces', 'Suited connectors', 'Other suited', 'Other offsuit'];

// Postflop: how strong the hand is on that board (its percentile among all possible hands, see boardStrength.js).
export const STRENGTHS = ['Nutted', 'Strong', 'Medium', 'Weak', 'Air'];
export function strengthBucket(percentile) {
  if (percentile >= 0.9) return 'Nutted';
  if (percentile >= 0.7) return 'Strong';
  if (percentile >= 0.45) return 'Medium';
  if (percentile >= 0.2) return 'Weak';
  return 'Air';
}

// ----- Focus: a kind of spot to practice -----

// A focus is the part of a spot worth asking Practice for: { area, position?, potType?, role?, ip? }.
// matchesFocus(spot, focus) is true when a classified decision is that kind of spot.
export function matchesFocus(spot, focus) {
  if (!focus) return true;
  if (focus.area && spot.area !== focus.area) return false;
  for (const key of ['position', 'potType', 'role', 'opener']) {
    if (focus[key] && spot[key] !== focus[key]) return false;
  }
  if (focus.ip !== undefined && spot.ip !== focus.ip) return false;
  return true;
}

// A focus as the table it's dealt at can seat it: a hand from a 9-handed table has a "MP" seat that an 8-handed
// table calls the lojack.
export function normalizeFocus(focus, positions) {
  if (!focus) return null;
  const seat = (position) => (position === 'MP' && !positions.includes('MP') ? 'LJ' : position);
  return { ...focus, ...(focus.position ? { position: seat(focus.position) } : {}), ...(focus.opener ? { opener: seat(focus.opener) } : {}) };
}

// The same, as URL parameters (/practice?drill=river-vs-bet&pos=BB&pot=srp&role=caller&ip=0) and back.
export function focusToParams(focus) {
  const params = new URLSearchParams();
  if (focus.area) params.set('drill', focus.area);
  if (focus.position) params.set('pos', focus.position);
  if (focus.opener) params.set('opener', focus.opener);
  if (focus.potType) params.set('pot', focus.potType);
  if (focus.role) params.set('role', focus.role);
  if (focus.ip !== undefined) params.set('ip', focus.ip ? '1' : '0');
  return params;
}
export function focusFromParams(params) {
  const area = params.get('drill');
  if (!areaById(area)) return null;
  const focus = { area };
  if (params.get('pos')) focus.position = params.get('pos');
  if (params.get('opener')) focus.opener = params.get('opener');
  if (POT_TYPES[params.get('pot')]) focus.potType = params.get('pot');
  if (['aggressor', 'caller', 'none'].includes(params.get('role'))) focus.role = params.get('role');
  if (params.get('ip') === '1' || params.get('ip') === '0') focus.ip = params.get('ip') === '1';
  return focus;
}

// "BB · facing a river bet · single-raised pot", for the chip that says what's being drilled.
export function describeFocus(focus) {
  const area = areaById(focus.area);
  const parts = [focus.position, area?.name.toLowerCase()];
  if (focus.opener) parts.push(`vs ${focus.opener}`);
  if (focus.potType) parts.push(POT_TYPES[focus.potType].toLowerCase());
  if (focus.role === 'aggressor') parts.push('as the raiser');
  if (focus.role === 'caller') parts.push('as the caller');
  if (focus.ip === true) parts.push('in position');
  if (focus.ip === false) parts.push('out of position');
  const text = parts.filter(Boolean).join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
