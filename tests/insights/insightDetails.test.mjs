// Detail views behind the cards: every kind builds from real-looking sessions, and copes with very few.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statDetail, monthDetail, shortMonth, longMonth } from '../../src/utils/insightDetails.js';
import { moneyScope, setMoneyUnit } from '../../src/utils/format.js';

const KINDS = ['net', 'hourly', 'winrate', 'winning', 'downswing', 'months', 'sessions', 'hours', 'normal'];
const SECTIONS = ['facts', 'bars', 'breakdown', 'curve', 'list', 'text'];
const s = (i, profit, extra = {}) => ({
  id: `d${i}`,
  date: `2026-${String(1 + (i % 6)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
  format: 'cash',
  game: i % 3 ? 'NLH' : 'PLO',
  stakes: i % 2 ? '$1/$2' : '$2/$5',
  venue: i % 4 ? 'Casino' : 'Online',
  bigBlind: i % 2 ? 2 : 5,
  buyIn: 100,
  cashOut: 100 + profit,
  expenses: 0,
  durationMin: 120 + (i % 5) * 60,
  hands: 100,
  ...extra,
});
const many = Array.from({ length: 40 }, (_, i) => s(i, ((i * 37) % 200) - 90));
// The same sessions, all at one big blind.
const oneStake = many.map((x) => ({ ...x, stakes: '$1/$2', bigBlind: 2 }));

test('month names', () => {
  assert.equal(shortMonth('2026-10'), 'Oct');
  assert.equal(longMonth('2026-01'), 'January 2026');
});

test('every kind builds a lead and sections', () => {
  for (const kind of KINDS) {
    const detail = statDetail(kind, moneyScope(many));
    assert.ok(detail.title, kind);
    assert.ok(detail.lead.value, kind);
    assert.ok(detail.sections.length > 0, kind);
    for (const section of detail.sections) assert.ok(SECTIONS.includes(section.type), `${kind}: ${section.type}`);
  }
});

test('one session is enough to open any card; none gives nothing', () => {
  for (const kind of KINDS) assert.ok(statDetail(kind, moneyScope([s(1, 50)])).lead, kind);
  assert.equal(statDetail('net', moneyScope([])), null);
  assert.equal(statDetail('normal', moneyScope([s(1, 50)])).lead.value, 'Too early to tell');
});

test('the bankroll curve carries its sessions, for the full-screen graph', () => {
  const scope = moneyScope(many);
  const curve = statDetail('net', scope).sections.find((section) => section.type === 'curve');
  assert.equal(curve.chart.sessions, scope.sessions);
  assert.equal(curve.data.length, many.length + 1); // a starting point, then one per session
});

test('totals across different blinds are in dollars and say why; one blind stays in big blinds', () => {
  setMoneyUnit('bb');
  const mixed = statDetail('net', moneyScope(many));
  assert.match(mixed.lead.value, /\$/);
  assert.match(mixed.note, /different blinds/);
  const single = statDetail('net', moneyScope(oneStake));
  assert.match(single.lead.value, / bb$/);
  assert.equal(single.note, null);
  setMoneyUnit('$');
  const dollars = statDetail('net', moneyScope(many));
  assert.match(dollars.lead.value, /\$/);
  assert.equal(dollars.note, null); // nobody asked for big blinds
  setMoneyUnit('bb');
});

test('a month: its total, the month before, and every session with a way to it', () => {
  const scope = moneyScope(many);
  const detail = monthDetail('2026-03', scope);
  const inMarch = many.filter((x) => x.date.startsWith('2026-03'));
  assert.equal(detail.title, 'March 2026');
  const list = detail.sections.find((section) => section.type === 'list');
  assert.equal(list.items.length, inMarch.length);
  for (const item of list.items) assert.match(item.to, /^\/history\/d\d+$/);
  assert.ok(detail.sections[0].items.some((item) => item.label === 'Against Feb'));
  assert.equal(monthDetail('2025-01', scope), null);
});
