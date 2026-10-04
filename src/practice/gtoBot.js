// Practice opponents (and your autopilot on the streets before a spot): every seat plays GTO. A bot asks the
// engine for the GTO strategy with its real cards and picks an action with those frequencies, so it plays
// exactly as balanced as the solution: premiums 3-bet, bluffs come in the right proportion, and so on.
import { getOptions } from '../utils/handEngine.js';

// Pick an index with the given probabilities.
function sample(weights, random) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let k = 0; k < weights.length; k++) {
    roll -= weights[k];
    if (roll <= 0) return k;
  }
  return weights.length - 1;
}

// An engine option ({ type, to (chips) }) as a hand-engine action, snapped to the small blind and kept legal.
export function toAppAction(state, option) {
  const opts = getOptions(state);
  const passive = { type: opts.toCall > 0 ? 'call' : 'check' };
  if (option.type === 'fold') return { type: opts.toCall > 0 ? 'fold' : 'check' };
  if (option.type === 'check' || option.type === 'call') return passive;
  if (!opts.canRaise) return passive;
  if (option.type === 'allin') return { type: 'allin' };
  const to = Math.max(opts.minTo, Math.round(option.to / state.sb) * state.sb);
  if (to >= opts.maxTo) return { type: 'allin' };
  return { type: state.currentBet > 0 ? 'raise' : 'bet', amount: Math.round(to * 100) / 100 };
}

// The GTO action for the player to act with `cards`. If the engine can't answer (a spot it doesn't cover),
// the bot plays it safe: check if it can, otherwise fold.
export function botAction(gto, state, cards, random) {
  let advice;
  try {
    advice = gto.advise(state, cards);
  } catch {
    advice = { unavailable: true };
  }
  if (advice.unavailable) return { type: getOptions(state).toCall > 0 ? 'fold' : 'check' };
  const pick = sample(advice.options.map((o) => o.frequency), random);
  return toAppAction(state, advice.options[pick]);
}
