// The hands the chart solver node-locks when they face a single raise (scripts/gto/preflop/cfr.mjs), and the
// coach grades them the same way (walker.js, and the Ranges page), so all of them read this file.
//
//   premiums       always re-raise: the flop model values flatting them about the same as re-raising (it can't
//                  see how much more a bigger pot is worth to them), and a flatted premium reads as a bug.
//   middle pairs   (22-99) only flat or fold: the model values a 3-bet with them above a call (it overrates the fold
//                  equity and the pot share of a hand with no draw), where published solver charts call with them,
//                  hit a set and win a stack, and 3-bet the polar top and the bluffs instead.
import { CLASS_NAMES } from '../cards.js';

export const PREMIUM_NAMES = ['AA', 'KK', 'QQ', 'AKs', 'AKo'];
export const FLAT_PAIR_NAMES = ['22', '33', '44', '55', '66', '77', '88', '99'];

const classesOf = (names) => new Set(names.map((name) => CLASS_NAMES.indexOf(name)));
export const PREMIUM_CLASSES = classesOf(PREMIUM_NAMES);
export const FLAT_PAIR_CLASSES = classesOf(FLAT_PAIR_NAMES);

// How much worse (bb) the options the lock rules out are shown than the best one it allows, so the cost shown
// agrees with the strategy (a hand never takes an action that is worth more than the ones it does).
export const LOCK_MARGIN = 0.25;

const isRaise = (type) => type === 'raise' || type === 'allin';

// What each action costs a hand class at a node (loss: bb worse than the best, per action), as the locks leave it.
// Only nodes facing a single raise are locked (level 1). Returns the same array when no lock applies.
export function lockedLosses(node, cls, loss) {
  if (node.level !== 1) return loss;
  const raises = node.actions.map((a, k) => (isRaise(a.type) ? k : -1)).filter((k) => k >= 0);
  if (!raises.length) return loss;

  let ruledOut = null; // the actions this hand can't take, and the ones it can
  let allowed = null;
  if (PREMIUM_CLASSES.has(cls)) {
    allowed = raises;
    ruledOut = node.actions.map((_, k) => k).filter((k) => !raises.includes(k));
  } else if (FLAT_PAIR_CLASSES.has(cls) && node.actions.some((a) => a.type === 'call')) {
    ruledOut = raises;
    allowed = node.actions.map((_, k) => k).filter((k) => !raises.includes(k));
  }
  if (!ruledOut) return loss;

  const best = Math.min(...allowed.map((k) => loss[k]));
  const shifted = loss.map((l, k) => (ruledOut.includes(k) ? Math.max(l, best + LOCK_MARGIN) : l));
  const floor = Math.min(...shifted);
  return shifted.map((l) => l - floor);
}
