// Spot labelling (src/coach/spots.js): every decision of a hand falls in one area, with the details drills and
// the leak report group by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playHand } from '../gto/helpers.mjs';
import { replayHand } from '../../src/coach/replay.js';
import { currentPlayer } from '../../src/utils/handEngine.js';
import {
  AREAS, classifySpot, spotTitle, spotChips, handFamily, strengthBucket, matchesFocus, focusToParams, focusFromParams, describeFocus,
} from '../../src/coach/spots.js';

// The spot of each of the hero's decisions, in order.
function heroSpots(setup) {
  const { record } = playHand(setup);
  const spots = [];
  replayHand(record, ({ state }) => {
    const actor = currentPlayer(state);
    if (actor.role === 'hero') spots.push(classifySpot(state, actor.seat));
  });
  return spots;
}
const folds = (...positions) => positions.map((p) => [p, 'fold']);

test('a first-in decision is an open, with a limper it is a limped pot', () => {
  const [open] = heroSpots({ hero: { position: 'BTN', cards: ['Ah', 'Kd'] }, actions: [...folds('UTG', 'UTG+1', 'LJ', 'HJ', 'CO'), ['BTN', 'raise', 2.5], ...folds('SB', 'BB')] });
  assert.equal(open.area, 'open');
  assert.equal(open.position, 'BTN');

  const [limped] = heroSpots({ hero: { position: 'BTN', cards: ['Ah', 'Kd'] }, actions: [...folds('UTG', 'UTG+1', 'LJ'), ['HJ', 'call'], ['CO', 'call'], ['BTN', 'raise', 6], ...folds('SB', 'BB', 'HJ', 'CO')] });
  assert.equal(limped.area, 'limped');
  assert.equal(limped.limpers, 2);
  assert.equal(spotTitle(limped), 'BTN vs 2 limpers');
});

test('facing an open: who opened, and whether anyone called', () => {
  const [spot] = heroSpots({ hero: { position: 'BB', cards: ['9h', '9d'] }, actions: [...folds('UTG', 'UTG+1', 'LJ', 'HJ', 'CO'), ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'call']] });
  assert.equal(spot.area, 'vs-open');
  assert.equal(spot.opener, 'BTN');
  assert.equal(spot.callers, 0);
  assert.equal(spotTitle(spot), 'BB vs BTN open');

  const [squeezed] = heroSpots({ hero: { position: 'BB', cards: ['9h', '9d'] }, actions: [...folds('UTG', 'UTG+1', 'LJ', 'HJ'), ['CO', 'raise', 2.5], ['BTN', 'call'], ['SB', 'fold'], ['BB', 'fold']] });
  assert.equal(squeezed.callers, 1);
  assert.equal(spotTitle(squeezed), 'BB vs CO open + a caller');
});

test('3-bets and 4-bets, from the opener and from the caller', () => {
  const spots = heroSpots({
    hero: { position: 'BTN', cards: ['Qh', 'Qd'] },
    actions: [...folds('UTG', 'UTG+1', 'LJ', 'HJ', 'CO'), ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'raise', 10], ['BTN', 'raise', 23], ['BB', 'allin'], ['BTN', 'call']],
  });
  assert.deepEqual(spots.map((s) => s.area), ['open', 'vs-3bet', 'vs-4bet']);
  assert.equal(spots[1].heroOpened, true);
  assert.equal(spotTitle(spots[1]), 'BTN open vs 3-bet');
  assert.equal(spots[1].opener, 'BTN');
});

test('postflop: the preflop raiser and the caller, in and out of position, betting and facing', () => {
  const setup = {
    hero: { position: 'BB', cards: ['Ah', 'Qd'] },
    board: ['Ks', '8d', '4c', '2h', '9s'],
    actions: [
      ...folds('UTG', 'UTG+1', 'LJ', 'HJ', 'CO'), ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'call'],
      ['BB', 'check'], ['BTN', 'bet', 3.5], ['BB', 'call'],
      ['BB', 'check'], ['BTN', 'check'],
      ['BB', 'bet', 6], ['BTN', 'fold'],
    ],
  };
  const spots = heroSpots(setup);
  assert.deepEqual(spots.map((s) => s.area), ['vs-open', 'flop-bet', 'flop-vs-bet', 'turn-bet', 'river-bet']);
  const [, flopLead, facing, turnLead] = spots;
  assert.equal(flopLead.role, 'caller');
  assert.equal(flopLead.ip, false);
  assert.equal(flopLead.potType, 'srp');
  assert.equal(spotTitle(flopLead), 'Flop lead');
  assert.equal(facing.facingRaise, false);
  assert.equal(spotTitle(facing), 'Facing a c-bet');
  assert.deepEqual(spotChips(facing), ['Out of position', 'Heads-up', 'Single-raised pot']);
  assert.equal(turnLead.checkedTo, false);
});

test('the caller who acts last in a 3-bet pot', () => {
  const spots = heroSpots({
    hero: { position: 'BTN', cards: ['Qh', 'Qd'] },
    board: ['5c', '8c', 'Jh', '2d', '7s'],
    actions: [
      ...folds('UTG', 'UTG+1', 'LJ', 'HJ', 'CO'), ['BTN', 'raise', 2.5], ['SB', 'fold'], ['BB', 'raise', 10], ['BTN', 'call'],
      ['BB', 'check'], ['BTN', 'bet', 6], ['BB', 'raise', 20], ['BTN', 'call'],
      ['BB', 'check'], ['BTN', 'check'],
      ['BB', 'bet', 20], ['BTN', 'call'],
    ],
  });
  const cbet = spots.find((s) => s.area === 'flop-bet');
  assert.equal(cbet.role, 'caller', 'the BB 3-bet, so the BTN is the caller in this pot');
  assert.equal(cbet.potType, '3bet');
  assert.equal(cbet.ip, true);
  assert.equal(cbet.checkedTo, true);
  assert.equal(spotTitle(cbet), 'Flop stab');
  assert.equal(spots.find((s) => s.area === 'flop-vs-bet').facingRaise, true);
  assert.ok(spots.some((s) => s.area === 'river-vs-bet'));
});

test('every spot has an area that exists', () => {
  const ids = new Set(AREAS.map((a) => a.id));
  assert.equal(ids.size, AREAS.length);
  for (const spot of heroSpots({ hero: { position: 'SB', cards: ['7h', '2d'] }, actions: [...folds('UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'), ['SB', 'fold']] })) {
    assert.ok(ids.has(spot.area));
  }
});

test('hand families and strength buckets', () => {
  assert.equal(handFamily('AA'), 'Big pairs');
  assert.equal(handFamily('55'), 'Small pairs');
  assert.equal(handFamily('KQs'), 'Suited broadways');
  assert.equal(handFamily('AJo'), 'Offsuit broadways');
  assert.equal(handFamily('A5s'), 'Suited aces');
  assert.equal(handFamily('A9o'), 'Offsuit aces');
  assert.equal(handFamily('76s'), 'Suited connectors');
  assert.equal(handFamily('T8s'), 'Suited connectors');
  assert.equal(handFamily('K6s'), 'Other suited');
  assert.equal(handFamily('Q7o'), 'Other offsuit');
  assert.deepEqual([0.95, 0.8, 0.5, 0.3, 0.05].map(strengthBucket), ['Nutted', 'Strong', 'Medium', 'Weak', 'Air']);
});

test('a focus matches the spots it names and survives the URL', () => {
  const spot = { area: 'river-vs-bet', position: 'BB', potType: 'srp', role: 'caller', ip: false, street: 'River' };
  assert.equal(matchesFocus(spot, null), true);
  assert.equal(matchesFocus(spot, { area: 'river-vs-bet' }), true);
  assert.equal(matchesFocus(spot, { area: 'river-vs-bet', position: 'BB', ip: false }), true);
  assert.equal(matchesFocus(spot, { area: 'river-vs-bet', position: 'BTN' }), false);
  assert.equal(matchesFocus(spot, { area: 'flop-vs-bet' }), false);
  assert.equal(matchesFocus(spot, { ip: true }), false);

  const focus = { area: 'river-vs-bet', position: 'BB', potType: 'srp', role: 'caller', ip: false };
  assert.deepEqual(focusFromParams(focusToParams(focus)), focus);
  assert.equal(focusFromParams(new URLSearchParams('drill=nonsense')), null);
  assert.equal(describeFocus(focus), 'BB · facing a river bet · single-raised pot · as the caller · out of position');
});
