// The engine's side: the same spot through PokerWiz's postflop solver (src/gto/postflop/solver.js), at the
// budgets the app uses ('full' for reviews, 'fast' for Practice).
import { solvePostflop } from '../../src/gto/postflop/solver.js';
import { cardId } from '../../src/gto/cards.js';

// spec: { board: ['Ks', ...], pot, stack (bb), oop, ip (1326 weights), line: [{ type, to? }] this street,
//         detail, seed, iterations?, ms?, sampling? (see solver.js) }. The line's actions alternate from the
//         first player to act (0 = out of position).
// Returns { solution, node (the decision at the end of the line), player }.
export function solveEngine({ board, pot, stack, oop, ip, line = [], detail = 'full', seed = 7, iterations, ms, sampling }) {
  const path = [];
  let player = 0;
  for (const step of line) {
    path.push({ player, type: step.type, to: step.to });
    player = 1 - player;
  }
  const solution = solvePostflop({ board: board.map(cardId), ranges: [oop, ip], pot, stacks: [stack, stack], path, detail, seed, iterations, ms, sampling });
  const node = solution.pathNodes[path.length];
  if (!node) throw new Error('The line ends the street: no decision left to compare');
  return { solution, node, player: node.player };
}
