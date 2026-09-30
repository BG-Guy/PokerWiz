// Web worker for the Equity Calculator. Runs off the main thread so the page stays smooth.
// Message in:  { id, players: [[codes] (0 or 2 cards)], board: [codes], iterations }
// Message out: { id, results: [{ win, tie, equity }], trials, exact }
import { evaluate } from '../../utils/handEvaluator.js';
import { codeToIndex } from '../../utils/cards.js';

self.onmessage = (event) => {
  const { id, players, board, iterations } = event.data;
  self.postMessage({ id, ...calculateEquity(players, board, iterations) });
};

function calculateEquity(playerCodes, boardCodes, iterations) {
  const hands = playerCodes.map((cards) => cards.map(codeToIndex));
  const board = boardCodes.map(codeToIndex);

  // Remaining deck = everything not already on the table.
  const dead = new Set([...hands.flat(), ...board]);
  const deck = [];
  for (let card = 0; card < 52; card++) if (!dead.has(card)) deck.push(card);

  const openSlots = [];
  for (let i = board.length; i < 5; i++) openSlots.push(i);
  const randomSeats = hands.flatMap((hand, i) => (hand.length === 0 ? [i] : []));

  const fullBoard = [...board, 0, 0, 0, 0, 0].slice(0, 5);
  const current = hands.map((hand) => hand.slice());
  const scores = new Array(hands.length);
  const tallies = hands.map(() => ({ win: 0, tie: 0, equity: 0 }));
  let trials = 0;

  // Score one complete deal: the best hand wins; equal best hands split.
  const settle = () => {
    let best = -1;
    let winners = 0;
    for (let p = 0; p < current.length; p++) {
      scores[p] = evaluate([...current[p], ...fullBoard]);
      if (scores[p] > best) {
        best = scores[p];
        winners = 1;
      } else if (scores[p] === best) {
        winners++;
      }
    }
    for (let p = 0; p < current.length; p++) {
      if (scores[p] !== best) continue;
      if (winners === 1) tallies[p].win++;
      else tallies[p].tie++;
      tallies[p].equity += 1 / winners;
    }
    trials++;
  };

  // Exact: every hand known and at most two board cards to come. Otherwise Monte Carlo.
  const exact = randomSeats.length === 0 && openSlots.length <= 2;
  if (exact) {
    if (openSlots.length === 0) settle();
    for (let a = 0; a < deck.length && openSlots.length >= 1; a++) {
      fullBoard[openSlots[0]] = deck[a];
      if (openSlots.length === 1) {
        settle();
        continue;
      }
      for (let b = a + 1; b < deck.length; b++) {
        fullBoard[openSlots[1]] = deck[b];
        settle();
      }
    }
  } else {
    const cards = deck.slice();
    const needed = openSlots.length + randomSeats.length * 2;
    for (let it = 0; it < iterations; it++) {
      // Partial Fisher-Yates: shuffle just the cards this deal needs to the front.
      for (let k = 0; k < needed; k++) {
        const j = k + Math.floor(Math.random() * (cards.length - k));
        [cards[k], cards[j]] = [cards[j], cards[k]];
      }
      let next = 0;
      for (const slot of openSlots) fullBoard[slot] = cards[next++];
      for (const seat of randomSeats) current[seat] = [cards[next++], cards[next++]];
      settle();
    }
  }

  return {
    results: tallies.map((t) => ({ win: t.win / trials, tie: t.tie / trials, equity: t.equity / trials })),
    trials,
    exact,
  };
}
