// Practice options: 3-bet pots only, drilling a kind of spot (a focus), and playing a hand again from your spot
// (same runout or a new one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDiskCharts } from '../gto/helpers.mjs';
import { generateSpot, heroAct, dealStreet, playAgain, formatOf } from '../../src/practice/generateSpot.js';
import { preflopRaises } from '../../src/utils/handEngine.js';
import { classifySpot } from '../../src/coach/spots.js';
import { createRandom } from '../../src/coach/random.js';

useDiskCharts();
const setupFor = (format, pot = '3bet') => ({ game: 'cash', format, pot, villains: [{ stackBB: 100 }], hero: { stackBB: 100 }, boardMode: 'random' });
const heroIn = (spot) => !spot.state.players.find((p) => p.seat === spot.heroSeat).folded;

test('3-bet pots only: heads-up spots are pots that were 3-bet before the flop, with you in them', async () => {
  for (const seed of [1, 2]) {
    const spot = await generateSpot(setupFor('hu'), createRandom(seed));
    assert.ok(spot, 'a spot is dealt');
    assert.equal(preflopRaises(spot.state), 2, spot.state.streets[0].actions.map((a) => `${a.actor} ${a.verb}`).join(', '));
    assert.equal(spot.state.players.filter((p) => !p.folded).length, 2);
    assert.ok(heroIn(spot));
  }
});

test('3-bet pots only, preflop: you make the 3-bet (facing one raise) or face it after opening or calling', async () => {
  for (const seed of [3, 4, 5, 6]) {
    const spot = await generateSpot(setupFor('preflop'), createRandom(seed));
    assert.ok(spot, 'a spot is dealt');
    assert.equal(spot.state.street, 'Preflop');
    const raises = preflopRaises(spot.state);
    const line = spot.state.streets[0].actions.map((a) => `${a.actor} ${a.verb}`).join(', ');
    if (raises === 1) {
      // GTO 3-bets this hand here at least some of the time: that's why it's the spot.
      const advice = spot.gto.advise(spot.state, spot.cards[spot.heroSeat]);
      const raising = advice.options.filter((o) => o.type === 'raise' || o.type === 'allin').reduce((sum, o) => sum + o.frequency, 0);
      assert.ok(raising > 0, `facing one raise with a hand GTO never 3-bets: ${line}`);
    } else {
      assert.equal(raises, 2, line);
      assert.ok(spot.state.streets[0].actions.some((a) => a.actor === 'Hero'), `facing a 3-bet cold: ${line}`);
    }
  }
});

// A focus asks for one kind of spot: you take over at the first decision that is it.
const drill = (focus, format = 'hu') => ({ game: 'cash', format, pot: 'any', villains: [{ stackBB: 100 }], hero: { stackBB: 100 }, boardMode: 'random', focus });

test('drilling a preflop spot: you are in the seat, facing what was asked for', async () => {
  const defend = await generateSpot(drill({ area: 'vs-open', position: 'BB' }), createRandom(31));
  assert.ok(defend, 'a spot is dealt');
  assert.equal(formatOf(drill({ area: 'vs-open' })), 'preflop', 'a preflop area is dealt as a preflop spot, whatever the setup said');
  const spot = classifySpot(defend.state, defend.heroSeat);
  assert.equal(spot.area, 'vs-open');
  assert.equal(spot.position, 'BB');
  assert.equal(defend.state.street, 'Preflop');

  const open = await generateSpot(drill({ area: 'open', position: 'BTN' }), createRandom(32));
  assert.equal(classifySpot(open.state, open.heroSeat).area, 'open');
  assert.equal(open.state.players.find((p) => p.seat === open.heroSeat).position, 'BTN');

  const answer = await generateSpot(drill({ area: 'vs-3bet' }), createRandom(33));
  assert.equal(classifySpot(answer.state, answer.heroSeat).area, 'vs-3bet', 'you opened (GTO\'s way), and now face the 3-bet');
});

test('drilling a postflop spot: the street, facing a bet or not, in or out of position', async () => {
  const facing = await generateSpot(drill({ area: 'flop-vs-bet', ip: false }), createRandom(41));
  assert.ok(facing, 'a spot is dealt');
  const spot = classifySpot(facing.state, facing.heroSeat);
  assert.equal(spot.area, 'flop-vs-bet');
  assert.equal(spot.ip, false);
  assert.equal(facing.state.street, 'Flop');
  assert.ok(facing.state.currentBet > 0);

  const betting = await generateSpot(drill({ area: 'turn-bet', role: 'aggressor' }), createRandom(42));
  const turn = classifySpot(betting.state, betting.heroSeat);
  assert.equal(turn.area, 'turn-bet');
  assert.equal(turn.role, 'aggressor');
  assert.equal(betting.state.street, 'Turn');
});

test('play again: the same spot, and with the same runout the same cards come', async () => {
  const random = createRandom(21);
  let spot = await generateSpot(setupFor('hu', 'any'), random);
  const start = { state: JSON.stringify(spot.state), cards: JSON.stringify(spot.cards) };
  // Play on (check or call) until a new card has come, then fold: the hand ends with a runout to repeat.
  const startBoard = spot.state.board.length;
  for (let guard = 0; guard < 20 && spot.status !== 'done'; guard++) {
    if (spot.status === 'board') spot = dealStreet(spot, null, random);
    else if (spot.state.board.length > startBoard || spot.state.street === 'River') spot = heroAct(spot, { type: 'fold' }, random);
    else spot = heroAct(spot, { type: spot.state.currentBet > 0 ? 'call' : 'check' }, random);
  }
  assert.equal(spot.status, 'done');
  const runout = spot.state.board.slice(startBoard);

  for (const sameRunout of [true, false]) {
    let again = await playAgain(spot, { sameRunout });
    assert.equal(JSON.stringify(again.state), start.state, 'the hand is back at your spot');
    assert.equal(JSON.stringify(again.cards), start.cards, 'everyone has the same cards');
    assert.equal(again.status, 'hero');
    assert.equal(again.firstDecision, spot.firstDecision);
    assert.deepEqual(again.again, { count: 1, sameRunout });
    // The deck never holds a card that's in someone's hand or still to come.
    const held = new Set([...Object.values(again.cards).flat(), ...again.state.board, ...again.plannedBoard]);
    assert.ok(again.deck.every((code) => !held.has(code)));
    if (sameRunout && runout.length) {
      for (let guard = 0; guard < 20 && again.state.board.length === startBoard && again.status !== 'done'; guard++) {
        again = again.status === 'board' ? dealStreet(again, null, random) : heroAct(again, { type: again.state.currentBet > 0 ? 'call' : 'check' }, random);
      }
      if (again.state.board.length > startBoard) assert.deepEqual(again.state.board.slice(startBoard), runout.slice(0, again.state.board.length - startBoard));
    }
  }
});
