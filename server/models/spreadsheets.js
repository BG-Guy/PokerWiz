// Spreadsheet exports: your sessions and your hands as CSV files that open in Excel, Numbers or Google Sheets.
// Oldest first, amounts in dollars. A byte-order mark makes Excel read accents and symbols as UTF-8.
import { listFinished } from './sessions.js';
import { listHands } from './hands.js';

// Review verdicts, worded as in the app (src/constants/poker.js).
const VERDICTS = { good: 'Good play', mistake: 'Mistake', cooler: 'Cooler', review: 'To review' };

// One cell. Numbers as they are (to the cent); text quoted when it needs to be. Text a spreadsheet would run
// as a formula (starting with = + - or @) gets a leading apostrophe, so notes can never run as formulas.
function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const toCsv = (header, rows) => `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;

// The big blind of a stakes label ("$1/$2" -> 2), or null.
function bigBlindOf(stakes) {
  const parsed = /\$?([\d.]+)\s*\/\s*\$?([\d.]+)/.exec(stakes ?? '');
  return parsed ? Number(parsed[2]) : null;
}

// Every finished session: when, what, how long, the money, and how it felt.
export function sessionsCsv() {
  const header = ['Date', 'Type', 'Game', 'Stakes', 'Venue', 'Hours', 'Hands', 'Buy-in', 'Cash-out', 'Expenses', 'Net', 'Net (bb)', 'Rating', 'Tilt', 'Notes', 'Imported from'];
  const rows = [...listFinished()].reverse().map((s) => {
    const tournament = s.format === 'tournament';
    const net = (s.cashOut ?? 0) - s.buyIn - (s.expenses ?? 0);
    return [
      s.date,
      tournament ? 'Tournament' : 'Cash game',
      s.game,
      s.stakes,
      s.venue,
      s.durationMin / 60,
      s.hands,
      s.buyIn,
      s.cashOut,
      s.expenses ?? 0,
      net,
      !tournament && s.bigBlind > 0 ? net / s.bigBlind : null,
      s.rating,
      s.tilt,
      s.notes,
      s.source,
    ];
  });
  return toCsv(header, rows);
}

// Every saved hand: the cards, the result, and your review.
export function handsCsv() {
  const header = ['Date', 'Title', 'Game', 'Stakes', 'Position', 'Your hand', 'Board', 'Result', 'Result (bb)', 'Final pot', 'Verdict', 'Rating', 'Tilt', 'Tags', 'Notes', 'Coach score'];
  const rows = [...listHands()].reverse().map((h) => {
    const bb = bigBlindOf(h.stakes);
    return [
      h.date,
      h.title,
      h.game,
      h.stakes,
      h.heroPosition,
      (h.holeCards ?? []).join(' '),
      (h.board ?? []).join(' '),
      h.result,
      bb && typeof h.result === 'number' ? h.result / bb : null,
      h.potSize,
      VERDICTS[h.verdict] ?? h.verdict,
      h.rating,
      h.tilt,
      (h.tags ?? []).join('; '),
      h.note,
      h.coachAccuracy,
    ];
  });
  return toCsv(header, rows);
}
