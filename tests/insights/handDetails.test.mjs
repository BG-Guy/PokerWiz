// The sheets behind the Hand Insights numbers and bars, and the short version of one hand (the hand list's sheet).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handGroupDetail, handStatDetail, handSummary } from '../../src/utils/handDetails.js';
import { handInsights } from '../../src/utils/handInsights.js';
import { handScope, setMoneyUnit } from '../../src/utils/format.js';

afterEach(() => setMoneyUnit('bb'));

const hand = (id, result, extra = {}) => ({
  id,
  date: `2026-09-${String(10 + Number(id.slice(1))).padStart(2, '0')}`,
  title: `Hand ${id}`,
  game: 'NLH',
  stakes: '$1/$3',
  heroPosition: 'BTN',
  holeCards: ['Qh', 'Qd'],
  board: ['5c', '8c', 'Jh', '5h', '7h'],
  result,
  potSize: Math.abs(result) * 2,
  rating: 4,
  tilt: 2,
  verdict: 'good',
  coachAccuracy: 74,
  note: '',
  tags: [],
  streets: [
    { name: 'Preflop', pot: 4, actions: [{ actor: 'UTG', verb: 'calls', amount: 3 }, { actor: 'Hero', verb: 'raises to', amount: 12 }, { actor: 'UTG', verb: 'folds' }] },
    { name: 'Flop', pot: 31, actions: [{ actor: 'BB', verb: 'checks' }, { actor: 'Hero', verb: 'bets', amount: 15 }] },
  ],
  ...extra,
});
const hands = [
  hand('h1', 300),
  hand('h2', -450, { heroPosition: 'BB', tilt: 5, rating: 2, verdict: 'mistake', streets: [{ name: 'River', pot: 100, actions: [{ actor: 'Hero', verb: 'calls', amount: 200 }] }] }),
  hand('h3', -60, { heroPosition: 'BB', tilt: 4, rating: 3 }),
  hand('h4', 90, { tilt: 1, rating: 5 }),
];
const section = (detail, title) => detail.sections.find((s) => s.title === title);

test('every Hand Insights box opens something', () => {
  for (const kind of ['count', 'net', 'rating', 'tilt']) {
    const detail = handStatDetail(kind, handScope(hands));
    assert.ok(detail.title && detail.lead.value, kind);
    assert.ok(detail.sections.length > 0, kind);
  }
  assert.equal(handStatDetail('net', handScope([])), null);
});

test('the net: wins and losses, with the hands behind them', () => {
  const detail = handStatDetail('net', handScope(hands));
  assert.equal(detail.lead.value, '-40 bb'); // -120 in dollars at a 3 big blind
  assert.deepEqual(section(detail, 'Biggest wins').items.map((item) => item.id), ['h1', 'h4']);
  assert.deepEqual(section(detail, 'Biggest losses').items.map((item) => item.id), ['h2', 'h3']);
  assert.equal(detail.note, null);
});

test('hands at different blinds add up in dollars, and the sheet says so', () => {
  const mixed = [...hands, hand('h5', 100, { stakes: '$1/$2' })];
  const detail = handStatDetail('net', handScope(mixed));
  assert.equal(detail.lead.value, '-$20');
  assert.match(detail.note, /different blinds/);
});

test('rating and tilt cope with hands that have none', () => {
  const bare = hands.map((h) => ({ ...h, rating: null, tilt: null }));
  assert.equal(handStatDetail('rating', handScope(bare)).lead.value, 'Not rated');
  assert.equal(handStatDetail('tilt', handScope(bare)).lead.value, 'Not noted');
  const tilt = handStatDetail('tilt', handScope(hands));
  assert.equal(tilt.lead.value, '3.0 of 5');
  assert.deepEqual(section(tilt, 'Most tilted').items.map((item) => item.value), ['Full tilt', 'Frustrated']);
});

test('a bar opens the hands behind it', () => {
  const scope = handScope(hands);
  const insights = handInsights(scope.hands, scope.money);
  const bb = insights.byPosition.find((group) => group.key === 'BB');
  const detail = handGroupDetail(bb, scope, 'seat');
  assert.equal(detail.title, 'From the BB');
  assert.equal(detail.lead.value, '-170 bb');
  assert.deepEqual(section(detail, 'The hands').items.map((item) => item.id), ['h2', 'h3']); // the costliest first
  const mistakes = handGroupDetail(insights.byVerdict.find((group) => group.key === 'mistake'), scope, 'verdict');
  assert.match(mistakes.lead.caption, /marked "Mistake"/);
});

test('the short version of a hand: the action in words, and the way to the full hand', () => {
  setMoneyUnit('bb');
  const detail = handSummary(hand('h1', 300, { note: 'Bet bigger next time.' }), { canCoach: true });
  assert.equal(detail.lead.value, '+100 bb');
  const streets = section(detail, 'How it went').items;
  assert.equal(streets[0].label, 'Preflop · pot 1.3 bb');
  assert.equal(streets[0].hint, 'UTG calls 1 bb, you raise to 4 bb, UTG folds');
  assert.equal(streets[1].hint, 'BB checks, you bet 5 bb');
  assert.deepEqual(section(detail, 'Your notes').paragraphs, ['Bet bigger next time.']);
  assert.deepEqual(detail.sections.at(-1).items.map((item) => item.to), ['/hands/h1', '/coach?hand=h1']);
  assert.equal(handSummary(hand('h1', 300)).sections.at(-1).items.length, 1); // no coach: just the full hand

  setMoneyUnit('$');
  assert.equal(handSummary(hand('h1', 300)).lead.value, '+$300');
});
