// Player models (src/gto/players): the solver answers a player with tendencies by exploiting them, and with
// no model it's plain GTO. River spots, where the right answer is clear, and the range a modelled player
// brings to the flop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solvePostflop } from '../../src/gto/postflop/solver.js';
import { modelFor } from '../../src/gto/players/models.js';
import { defaultProfile, applyPreset, applyLevel } from '../../src/coach/profiles.js';
import { readFileSync } from 'node:fs';
import { setChartLoader } from '../../src/gto/preflop/charts.js';
import { createGtoHand } from '../../src/gto/hand.js';
import { createHand, applyAction } from '../../src/utils/handEngine.js';
import { TABLE_POSITIONS } from '../../src/constants/poker.js';
import { cardId, CLASS_NAMES, expandClasses, HAND_CLASS, CLASS_COMBOS } from '../../src/gto/cards.js';

const BOARD = ['As', 'Kd', '7c', '4h', '2s'].map(cardId);
const range = (names) => {
  const classes = new Float32Array(169);
  for (const name of names) classes[CLASS_NAMES.indexOf(name)] = 1;
  return expandClasses(classes, BOARD);
};
// Out of position: bluff-catchers (top pair, weaker kickers) and some air. In position: sets, two pair and air.
const OOP = range(['AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'QJs', 'JTs']);
const IP = range(['77', '44', 'AKs', 'AKo', 'QTs', 'T9s', '98s', '65s', 'J9s']);
const AIR = ['QTs', 'T9s', '98s', '65s', 'J9s'].map((n) => CLASS_NAMES.indexOf(n));
const VALUE = ['77', '44', 'AKs', 'AKo'].map((n) => CLASS_NAMES.indexOf(n));

const profile = (tendency, level) => applyLevel(applyPreset(defaultProfile(), tendency), level);

// The in-position player's betting frequency after a check, over a set of hand classes.
function betShare(models, classes) {
  const sol = solvePostflop({ board: BOARD, ranges: [OOP, IP], pot: 10, stacks: [50, 50], path: [{ player: 0, type: 'check' }], models, iterations: 400, ms: 60000 });
  const node = sol.pathNodes[1];
  const list = sol.lists[1];
  const n = list.count;
  const strategy = sol.strategy(node);
  const bets = node.actions.map((a, i) => (a.type === 'bet' || a.type === 'allin' ? i : -1)).filter((i) => i >= 0);
  let total = 0;
  let betting = 0;
  for (let k = 0; k < n; k++) {
    const hand = list.hands[k];
    const cls = classOfHand(hand);
    if (!classes.includes(cls)) continue;
    total += list.weights[k];
    betting += list.weights[k] * bets.reduce((s, a) => s + strategy[a * n + k], 0);
  }
  return betting / total;
}
const classOfHand = (hand) => HAND_CLASS[hand];

test('no read means no model: the solve is plain GTO', () => {
  assert.equal(modelFor(defaultProfile()), null);
  assert.equal(betShare([null, null], AIR).toFixed(4), betShare(undefined, AIR).toFixed(4));
});

test('against a calling station the bluffs go and the value stays', () => {
  const gtoBluffs = betShare([null, null], AIR);
  const station = modelFor(profile('station', 'beginner'));
  assert.ok(station.weight > 0.8, `a beginner station is mostly tendency (${station.weight})`);
  const bluffs = betShare([station, null], AIR);
  const value = betShare([station, null], VALUE);
  assert.ok(gtoBluffs > 0.15, `GTO bluffs some air (${gtoBluffs.toFixed(2)})`);
  assert.ok(bluffs < gtoBluffs / 2, `bluffs drop against a station: ${bluffs.toFixed(2)} vs GTO ${gtoBluffs.toFixed(2)}`);
  assert.ok(value > 0.9, `value still bets (${value.toFixed(2)})`);
});

test('against a nit who folds too much, the bluffs go up', () => {
  const gtoBluffs = betShare([null, null], AIR);
  const nit = modelFor(profile('nit', 'rec'));
  const bluffs = betShare([nit, null], AIR);
  assert.ok(bluffs > gtoBluffs + 0.15, `more bluffs against a nit: ${bluffs.toFixed(2)} vs GTO ${gtoBluffs.toFixed(2)}`);
});

// Preflop: a modelled big blind brings a range to the flop that matches their tendency.

setChartLoader(async (name) => new Uint8Array(readFileSync(new URL(`../../src/gto/preflop/charts/${name}.pfc`, import.meta.url))));

// Share of all hands the big blind holds after calling a button open (8-handed, 100 bb).
async function bigBlindWidth(model) {
  const positions = TABLE_POSITIONS[8];
  const players = positions.map((position, seat) => ({ seat, position, role: 'villain', name: position, stack: 200 }));
  let state = createHand({ players, positions, sb: 1, bb: 2 });
  const bb = positions.indexOf('BB');
  const gto = await createGtoHand({ state, stackBB: 100, models: model ? { [bb]: model } : {} });
  const line = [{ type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'fold' }, { type: 'raise', amount: 5 }, { type: 'fold' }, { type: 'call' }];
  for (const action of line) {
    gto.apply(state, action);
    state = applyAction(state, action);
  }
  const range = gto.rangeOf(state, bb);
  const max = Math.max(...range);
  return range.reduce((sum, w, c) => sum + (w / max) * CLASS_COMBOS[c], 0) / 1326;
}

test('preflop: a calling station flats wider than GTO, a nit narrower', async () => {
  const gto = await bigBlindWidth(null);
  const station = await bigBlindWidth(modelFor(profile('station', 'beginner')));
  const nit = await bigBlindWidth(modelFor(profile('nit', 'regular')));
  assert.ok(station > gto * 1.2, `station ${station.toFixed(2)} vs GTO ${gto.toFixed(2)}`);
  assert.ok(nit < gto * 0.85, `nit ${nit.toFixed(2)} vs GTO ${gto.toFixed(2)}`);
});
