// The sheets behind one session's numbers, the session's short version, a running session's numbers, and a goal.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { liveSessionDetail, sessionDetail, sessionSummary } from '../../src/utils/sessionDetails.js';
import { goalDetail, goalsOverview } from '../../src/utils/goalDetails.js';
import { analyzeGoal } from '../../src/utils/goalInsights.js';
import { setMoneyUnit } from '../../src/utils/format.js';

afterEach(() => setMoneyUnit('bb'));

const SECTIONS = ['facts', 'list', 'text', 'hands', 'actions', 'bars'];
const session = (extra = {}) => ({
  id: 's1',
  date: '2026-09-29',
  format: 'cash',
  game: 'NLH',
  stakes: '$1/$3',
  bigBlind: 3,
  venue: 'Casino',
  durationMin: 240,
  buyIn: 500,
  cashOut: 860,
  expenses: 0,
  hands: 120,
  notes: 'Table was soft after midnight.',
  events: [{ id: 'e1', type: 'rebuy', amount: 200, createdAt: '2026-09-30T02:10:00.000Z' }],
  ...extra,
});
const hand = (id, result, extra = {}) => ({ id, sessionId: 's1', title: `Hand ${id}`, heroPosition: 'BTN', holeCards: ['Ah', 'Kd'], result, coachAccuracy: 80, rating: 4, verdict: 'good', ...extra });
const others = [session({ id: 's2', cashOut: 300, date: '2026-09-20' }), session({ id: 's3', cashOut: 1200, date: '2026-09-10' }), session({ id: 's4', stakes: '$1/$2', bigBlind: 2, cashOut: 520 })];
const fact = (detail, label) => detail.sections.flatMap((section) => section.items ?? []).find((item) => item.label === label);

test('every number of a session opens something', () => {
  for (const kind of ['result', 'buyin', 'cashout', 'rate', 'hands', 'grade']) {
    const detail = sessionDetail(kind, session(), { hands: [hand('h1', 240)], sessions: [session(), ...others] });
    assert.ok(detail.title && detail.lead.value, kind);
    assert.ok(detail.sections.length > 0, kind);
    for (const section of detail.sections) assert.ok(SECTIONS.includes(section.type), `${kind}: ${section.type}`);
  }
  assert.equal(sessionDetail('nothing', session()), null);
});

test('a session is at one big blind: its amounts follow the switch, and the other unit rides along', () => {
  setMoneyUnit('bb');
  const inBB = sessionDetail('result', session(), { sessions: [session(), ...others] });
  assert.equal(inBB.lead.value, '+120 bb');
  assert.equal(fact(inBB, 'In dollars').value, '+$360');
  assert.equal(fact(inBB, 'Per 100 hands').value, '+100.0 bb');
  setMoneyUnit('$');
  const inDollars = sessionDetail('result', session(), { sessions: [session(), ...others] });
  assert.equal(inDollars.lead.value, '+$360');
  assert.equal(fact(inDollars, 'In big blinds').value, '+120 bb');
});

test('the result says where the session stands among the others', () => {
  const detail = sessionDetail('result', session(), { sessions: [session(), ...others] });
  const rank = fact(detail, 'By money won');
  assert.equal(rank.value, '2nd of 4'); // only s3 won more
  assert.ok(fact(detail, 'Your other NLH $1/$3 sessions'));
});

test('the buy-in lists the rebuys; the rate stays in bb an hour for a cash game', () => {
  setMoneyUnit('$');
  const buyIn = sessionDetail('buyin', session());
  assert.equal(buyIn.lead.value, '$500');
  assert.equal(fact(buyIn, 'Sat down with').value, '$300');
  assert.equal(buyIn.sections.find((s) => s.title === 'Every rebuy').items.length, 1);
  assert.equal(sessionDetail('rate', session(), { sessions: [session()] }).lead.value, '+30.0 bb/h');
  const tournament = session({ format: 'tournament', bigBlind: null, stakes: '' });
  assert.equal(sessionDetail('rate', tournament).title, 'Per hour');
  assert.equal(sessionDetail('rate', tournament).lead.value, '+$90/h');
});

test('the hands and the grade lead on to the saved hands', () => {
  const hands = [hand('h1', 240), hand('h2', -90, { verdict: 'mistake' })];
  const detail = sessionDetail('hands', session(), { hands });
  assert.equal(detail.sections.find((s) => s.type === 'hands').items.length, 2);
  assert.equal(detail.sections.at(-1).items[0].to, '/hands?session=s1');
  assert.equal(fact(detail, 'Marked mistakes').value, '1');
  const grade = sessionDetail('grade', session(), { hands });
  assert.match(grade.lead.value, /^[A-F] · /);
  assert.equal(grade.sections[0].items.length, 3); // decisions, results, time
});

test('the short version of a session ends with the way to its page', () => {
  const summary = sessionSummary(session(), [hand('h1', 240)]);
  assert.equal(summary.title, 'NLH $1/$3');
  assert.equal(summary.lead.value, '+120 bb');
  const actions = summary.sections.at(-1);
  assert.equal(actions.type, 'actions');
  assert.deepEqual(actions.items.map((item) => item.to), ['/history/s1', '/hands?session=s1']);
  assert.equal(sessionSummary(session(), []).sections.at(-1).items.length, 1);
});

test('a running session: buy-in, the estimate of hands dealt, saved hands and notes', () => {
  const live = session({ cashOut: null, events: [{ id: 'a', type: 'note', text: 'Seat 4 limps', createdAt: '2026-09-30T02:00:00.000Z' }, { id: 'b', type: 'hand', text: 'AK vs QQ', amount: -150, handId: 'h9', createdAt: '2026-09-30T02:30:00.000Z' }, { id: 'c', type: 'rebuy', amount: 200, createdAt: '2026-09-30T02:40:00.000Z' }] });
  assert.equal(liveSessionDetail('dealt', live, 2 * 3600000).lead.value, 'About 60');
  assert.equal(liveSessionDetail('saved', live, 0).sections[0].items[0].to, '/hands/h9');
  assert.equal(liveSessionDetail('notes', live, 0).sections[0].items[0].label, 'Seat 4 limps');
  assert.equal(liveSessionDetail('buyin', live, 0).title, 'Buy-in');
  assert.equal(liveSessionDetail('saved', session({ events: [] }), 0).lead.value, '0 hands');
});

test('a goal: its pace, what is left, and where to work on it', () => {
  const goal = { id: 'g1', title: 'Play 20,000 hands', category: 'Volume', unit: 'hands', start: 0, current: 5000, target: 20000, startDate: '2026-07-01', deadline: '2026-12-31', history: [1000, 3000, 5000] };
  const detail = goalDetail(goal, '2026-10-01');
  assert.equal(detail.lead.value, '25%');
  assert.equal(fact(detail, 'To go').value, '15,000 hands');
  assert.deepEqual(detail.sections.at(-1).items.map((item) => item.to), ['/history', '/goals']);
  const overview = goalsOverview([{ goal, analysis: analyzeGoal(goal, '2026-10-01') }]);
  assert.equal(overview.lead.value, '0 of 1');
  assert.equal(overview.sections[0].items[0].value, '25%');
});
