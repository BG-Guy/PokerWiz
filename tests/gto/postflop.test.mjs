// The postflop solver against poker theory, and the whole engine end to end: the coach grading a hand and
// Practice opponents playing GTO.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDiskCharts, playHand } from './helpers.mjs';
import { solvePostflop } from '../../src/gto/postflop/solver.js';
import { cardId, handIndex } from '../../src/gto/cards.js';
import { analyzeHand } from '../../src/coach/analyzeHand.js';
import { generateSpot, heroAct, dealStreet } from '../../src/practice/generateSpot.js';
import { botAction } from '../../src/practice/gtoBot.js';
import { createGtoHand } from '../../src/gto/hand.js';
import { createHand, applyAction, currentPlayer } from '../../src/utils/handEngine.js';
import { TABLE_POSITIONS } from '../../src/constants/poker.js';
import { createRandom } from '../../src/coach/random.js';

useDiskCharts();
const hand = (a, b) => handIndex(cardId(a), cardId(b));
const SUITS = 'cdhs';
// A range holding every combo of the given rank pairs (['7', '7'] = sevens, ['6', '5'] = six-five).
function rangeOf(pairs) {
  const weights = new Float32Array(1326);
  for (const [r1, r2] of pairs) {
    for (const s1 of SUITS) for (const s2 of SUITS) if (r1 + s1 !== r2 + s2) weights[hand(r1 + s1, r2 + s2)] = 1;
  }
  return weights;
}
// Share of a player's range (weighted) taking action `a` at a node, among the hands passing `filter`.
function share(sol, node, a, filter = () => true) {
  const list = sol.lists[node.player];
  const s = sol.strategy(node);
  let taken = 0;
  let total = 0;
  for (let k = 0; k < list.count; k++) {
    if (!filter(list.hands[k])) continue;
    total += list.weights[k];
    taken += list.weights[k] * s[a * list.count + k];
  }
  return taken / total;
}

test('river: value bets, bluffs and bluff-catching follow the theory', () => {
  // Board Kh 7d 2c 9s 4h. Out of position: sets of sevens (value) and six-five (air). In position: king-queen,
  // which beats the air and loses to the set. Polarized vs bluff-catcher: bet the nuts, bluff some air, and
  // the bluff-catcher calls just enough to make the bluffs break even.
  const board = ['Kh', '7d', '2c', '9s', '4h'].map(cardId);
  const sol = solvePostflop({ board, ranges: [rangeOf([['7', '7'], ['6', '5']]), rangeOf([['K', 'Q']])], pot: 10, stacks: [20, 20], iterations: 600, ms: 30000 });
  assert.ok(sol.exploitability() < 0.01, `exploitability ${sol.exploitability()}`);
  const root = sol.tree.root;
  const check = root.actions.findIndex((a) => a.type === 'check');
  const sets = new Set([hand('7c', '7h'), hand('7c', '7s'), hand('7h', '7s')]);
  // The set always bets (never gives king-queen a free showdown).
  assert.ok(share(sol, root, check, (h) => sets.has(h)) < 0.05, 'the set bets');
  // Some air bluffs, but not all of it.
  const bluff = 1 - share(sol, root, check, (h) => !sets.has(h));
  assert.ok(bluff > 0.02 && bluff < 0.6, `air bluffs ${bluff}`);
  // Facing a bet it uses, king-queen calls some and folds some.
  for (const [a, action] of root.actions.entries()) {
    if (action.type === 'check' || share(sol, root, a) < 0.15) continue;
    const response = root.children[a];
    const calls = share(sol, response, response.actions.findIndex((x) => x.type === 'call'));
    assert.ok(calls > 0.1 && calls < 0.95, `king-queen calls a ${action.type} to ${action.to}: ${calls}`);
  }
});

test('river, 3-way: strategies are proper mixes and the nuts never folds', () => {
  const board = ['As', 'Kd', '7h', '4c', '2s'].map(cardId);
  const wide = rangeOf([['A', 'K'], ['A', 'Q'], ['K', 'Q'], ['7', '7'], ['Q', 'J'], ['J', 'T'], ['A', 'A'], ['9', '8']]);
  const sol = solvePostflop({ board, ranges: [wide, wide, wide], pot: 30, stacks: [85, 85, 85], iterations: 150, ms: 20000 });
  for (const node of sol.tree.decisions.slice(0, 40)) {
    const s = sol.strategy(node);
    const n = sol.lists[node.player].count;
    for (let k = 0; k < n; k += 7) {
      const total = node.actions.reduce((sum, _, a) => sum + s[a * n + k], 0);
      assert.ok(Math.abs(total - 1) < 1e-4, 'a strategy adds up to 1');
    }
    // Top set (aces) never folds.
    const fold = node.actions.findIndex((a) => a.type === 'fold');
    const k = sol.handPosition(node.player, hand('Ac', 'Ah'));
    if (fold >= 0 && k >= 0) assert.ok(s[fold * n + k] < 0.02, 'aces never fold');
  }
});

test('the coach grades a flatted premium below the GTO 3-bet', async () => {
  const { record } = playHand({
    hero: { position: 'BTN', cards: ['Kh', 'Kd'] },
    actions: [['UTG', 'fold'], ['UTG+1', 'fold'], ['LJ', 'fold'], ['HJ', 'fold'], ['CO', 'raise', 2.5], ['BTN', 'call'], ['SB', 'fold'], ['BB', 'fold']],
  });
  const [decision] = (await analyzeHand(record)).decisions;
  assert.equal(decision.graded, true);
  assert.equal(decision.best.type, 'raise');
  assert.equal(decision.actual.type, 'call');
  assert.ok(decision.score < 80, `flatting kings scores ${decision.score}`);
  assert.ok(decision.options.find((o) => o.type === 'raise').frequency > 0.9);
});

test('the coach solves and grades postflop decisions', async () => {
  const { record } = playHand({
    hero: { position: 'BTN', cards: ['Ah', 'Kh'] },
    board: ['Ks', '7d', '2c', '4h', '9s'],
    actions: [['UTG', 'fold'], ['UTG+1', 'fold'], ['LJ', 'fold'], ['HJ', 'fold'], ['CO', 'fold'], ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'call'], ['BB', 'check'], ['BTN', 'bet', 1.8], ['BB', 'fold']],
  });
  const report = await analyzeHand(record, { detail: 'fast' });
  const flop = report.decisions.find((d) => d.street === 'Flop');
  assert.equal(flop.graded, true);
  assert.equal(flop.source, 'solver');
  // Top pair, top kicker on a dry king-high board: GTO bets it almost always, and the real 33% bet is fine.
  const betting = flop.options.filter((o) => o.kind === 'raise').reduce((sum, o) => sum + o.frequency, 0);
  assert.ok(betting > 0.6, `bets ${betting}`);
  assert.ok(flop.score >= 85, `the c-bet scores ${flop.score}`);
});

test('practice opponents play GTO: premiums re-raise a single raise', async () => {
  // Full preflops at an 8-handed table where every seat is a GTO bot: every time AA, KK, QQ or AK faces exactly
  // one raise, how often it re-raises (the old practice bots flatted these far too often).
  const random = createRandom(7);
  const deckOf = () => [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => r + s));
  const counts = { facing: 0, reraised: 0, folded: 0 };
  const positions = TABLE_POSITIONS[8];
  for (let k = 0; k < 1500; k++) {
    const deck = deckOf();
    const cards = Object.fromEntries(positions.map((_, seat) => [seat, [0, 1].map(() => deck.splice(Math.floor(random() * deck.length), 1)[0])]));
    const players = positions.map((position, seat) => ({ seat, position, role: seat === 0 ? 'hero' : 'villain', name: position, stack: 200 }));
    let state = createHand({ players, positions, sb: 1, bb: 2 });
    const gto = await createGtoHand({ state, stackBB: 100, known: cards });
    let raises = 0;
    while (state.phase === 'action') {
      const actor = currentPlayer(state);
      const action = botAction(gto, state, cards[actor.seat], random);
      const [a, b] = cards[actor.seat];
      const premium = (a[0] === b[0] && 'AKQ'.includes(a[0])) || (a[0] + b[0] === 'AK' || a[0] + b[0] === 'KA');
      const aggressive = action.type === 'raise' || action.type === 'allin';
      if (premium && raises === 1 && state.currentBet > state.bb) {
        counts.facing++;
        if (aggressive) counts.reraised++;
        if (action.type === 'fold') counts.folded++;
      }
      gto.apply(state, action);
      state = applyAction(state, action);
      if (aggressive) raises++;
    }
  }
  console.log(`premiums facing one raise: ${counts.facing}, re-raised ${counts.reraised}, folded ${counts.folded}`);
  assert.ok(counts.facing >= 30, `enough cases: ${counts.facing}`);
  assert.equal(counts.folded, 0, 'premiums never fold to a single raise');
  assert.ok(counts.reraised / counts.facing >= 0.85, `${counts.reraised}/${counts.facing} premiums re-raised`);
});

test('a heads-up practice hand plays to the end against GTO opponents', async () => {
  const random = createRandom(11);
  let spot = await generateSpot({ game: 'cash', format: 'hu', villains: [{ stackBB: 100 }], hero: { stackBB: 100 } }, random);
  assert.ok(spot, 'a heads-up spot is dealt');
  assert.equal(spot.status, 'hero');
  assert.equal(spot.state.players.filter((p) => !p.folded).length, 2);
  for (let guard = 0; guard < 20 && spot.status !== 'done'; guard++) {
    if (spot.status === 'board') spot = dealStreet(spot, null, random);
    else spot = heroAct(spot, { type: spot.state.currentBet > 0 ? 'call' : 'check' }, random);
  }
  assert.equal(spot.status, 'done');
});
