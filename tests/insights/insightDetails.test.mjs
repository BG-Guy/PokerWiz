// Detail views behind the cards: every kind builds from real-looking sessions, and copes with very few.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statDetail, shortMonth, longMonth } from '../../src/utils/insightDetails.js';

const KINDS = ['net', 'hourly', 'winrate', 'winning', 'downswing', 'months', 'sessions', 'hours', 'normal'];
const s = (i, profit, extra = {}) => ({
  id: `d${i}`,
  date: `2026-${String(1 + (i % 6)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
  format: 'cash',
  game: i % 3 ? 'NLH' : 'PLO',
  stakes: i % 2 ? '$1/$2' : '$2/$5',
  venue: i % 4 ? 'Casino' : 'Online',
  bigBlind: 1,
  buyIn: 100,
  cashOut: 100 + profit,
  expenses: 0,
  durationMin: 120 + (i % 5) * 60,
  hands: 100,
  ...extra,
});
const many = Array.from({ length: 40 }, (_, i) => s(i, ((i * 37) % 200) - 90));

test('month names', () => {
  assert.equal(shortMonth('2026-10'), 'Oct');
  assert.equal(longMonth('2026-01'), 'January 2026');
});

test('every kind builds a lead and sections', () => {
  for (const kind of KINDS) {
    const detail = statDetail(kind, many);
    assert.ok(detail.title, kind);
    assert.ok(detail.lead.value, kind);
    assert.ok(detail.sections.length > 0, kind);
    for (const section of detail.sections) assert.ok(['facts', 'bars', 'breakdown', 'curve', 'list', 'text'].includes(section.type), `${kind}: ${section.type}`);
  }
});

test('one session is enough to open any card; none gives nothing', () => {
  for (const kind of KINDS) assert.ok(statDetail(kind, [s(1, 50)]).lead, kind);
  assert.equal(statDetail('net', []), null);
  assert.equal(statDetail('normal', [s(1, 50)]).lead.value, 'Too early to tell');
});
