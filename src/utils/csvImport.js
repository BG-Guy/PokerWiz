// Reading session exports from other apps (CSV) into PokerWiz sessions, entirely in the browser.
// Supported: Regroup's poker export, one session per row with these columns:
//   date, format, type, location, buyin, totalExpenses, hours, cashout, bigBlind, smallBlind, ante, notes
// Nothing is saved here: the result is shown as a preview, then sent to POST /api/sessions/import.
import { sessionProfit } from './stats.js';

// Live tables deal about 30 hands an hour (the server uses the same rate for imported sessions).
const HANDS_PER_HOUR = 30;
const REQUIRED_COLUMNS = ['date', 'format', 'buyin', 'hours', 'cashout'];

// CSV text -> rows of fields (RFC 4180): commas, quoted fields that hold commas, line breaks and doubled
// quotes (""), CRLF or LF line ends, and a byte-order mark at the start. Blank lines are dropped.
export function parseCsv(text) {
  const source = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

// "$1,200" or "900" -> 1200 / 900; empty -> null; anything else -> NaN (reported as a problem).
function amount(value) {
  const cleaned = String(value ?? '').replace(/[$,\s]/g, '');
  return cleaned === '' ? null : Number(cleaned);
}

// Local calendar date (YYYY-MM-DD) of a moment, in the browser's time zone (sessions are logged by local day).
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "NLH", "NLHE", "Hold'em" -> NLH; "PLO", "Omaha" -> PLO; anything else as written (short).
function gameOf(type) {
  const t = String(type ?? '').trim().toUpperCase();
  if (t === '' || t.startsWith('NL') || t.includes('HOLD')) return 'NLH';
  if (t.startsWith('PLO') || t.includes('OMAHA')) return 'PLO';
  return t.slice(0, 12);
}

// $3, $0.5, $1,000: for stakes labels and messages.
const money = (n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// A Regroup export (CSV text) -> { sessions, warnings, skipped, error }.
//   sessions  ready for the import API (date, startedAt, format, game, stakes, bigBlind, smallBlind, ante,
//             venue, durationMin, buyIn, cashOut, expenses, notes, externalId), in file order
//   warnings  things that were filled in (e.g. a missing cash-out counted as $0), one sentence each
//   skipped   rows that couldn't be read, with the reason
//   error     the whole file can't be read (wrong columns, empty)
export function readRegroupCsv(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { sessions: [], warnings: [], skipped: [], error: 'The file is empty.' };
  const columns = header.map((name) => name.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((name) => !columns.includes(name.toLowerCase()));
  if (missing.length > 0) {
    return {
      sessions: [],
      warnings: [],
      skipped: [],
      error: `This doesn't look like a Regroup export: it's missing the ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}.`,
    };
  }
  const get = (row, name) => row[columns.indexOf(name.toLowerCase())] ?? '';

  const sessions = [];
  const warnings = [];
  const skipped = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const label = `Row ${index + 1}`;
    const started = new Date(get(row, 'date').trim());
    if (Number.isNaN(started.getTime())) return skipped.push(`${label}: the date "${get(row, 'date')}" can't be read.`);

    const rawFormat = get(row, 'format').trim().toUpperCase();
    const format = rawFormat === 'CASH' ? 'cash' : ['TOURNAMENT', 'MTT', 'SNG', 'SIT AND GO'].includes(rawFormat) ? 'tournament' : null;
    if (!format) return skipped.push(`${label}: unknown format "${get(row, 'format')}" (expected CASH or TOURNAMENT).`);

    const buyIn = amount(get(row, 'buyin'));
    const hours = amount(get(row, 'hours'));
    const expenses = amount(get(row, 'totalExpenses')) ?? 0;
    let cashOut = amount(get(row, 'cashout'));
    if (buyIn == null || Number.isNaN(buyIn) || buyIn < 0) return skipped.push(`${label}: no buy-in.`);
    if (hours == null || Number.isNaN(hours) || hours < 0) return skipped.push(`${label}: no hours played.`);
    if (Number.isNaN(expenses) || expenses < 0 || (cashOut != null && (Number.isNaN(cashOut) || cashOut < 0))) {
      return skipped.push(`${label}: an amount can't be read.`);
    }

    const venue = get(row, 'location').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Unknown';
    const date = localDate(started);
    const when = `${started.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${format === 'cash' ? 'cash' : 'tournament'}, ${venue})`;
    if (cashOut == null) {
      cashOut = 0;
      warnings.push(`${when}: no cash-out recorded, counted as $0 (the ${money(buyIn)} buy-in was lost).`);
    }

    // Cash games need stakes; tournaments have no big blind (big-blind stats leave them out).
    let bigBlind = 0;
    let smallBlind = null;
    let stakes = 'Tournament';
    if (format === 'cash') {
      bigBlind = amount(get(row, 'bigBlind'));
      if (bigBlind == null || Number.isNaN(bigBlind) || bigBlind <= 0) return skipped.push(`${label}: a cash game without a big blind.`);
      smallBlind = amount(get(row, 'smallBlind'));
      if (smallBlind == null || Number.isNaN(smallBlind)) smallBlind = bigBlind / 2;
      stakes = `${money(smallBlind)}/${money(bigBlind)}`;
    }
    const ante = amount(get(row, 'ante'));

    // The same session twice in one file is only imported once.
    const externalId = `regroup:${started.toISOString()}:${format}:${buyIn}:${venue.toLowerCase().slice(0, 60)}`;
    if (seen.has(externalId)) return skipped.push(`${label}: the same session appears twice in the file.`);
    seen.add(externalId);

    sessions.push({
      date,
      startedAt: started.toISOString(),
      format,
      game: gameOf(get(row, 'type')),
      stakes,
      bigBlind,
      smallBlind,
      ante: ante == null || Number.isNaN(ante) ? null : ante,
      venue,
      durationMin: Math.round(hours * 60),
      buyIn,
      cashOut,
      expenses,
      notes: get(row, 'notes').replace(/\r\n?/g, '\n').trim(),
      externalId,
    });
  });
  return { sessions, warnings, skipped, error: sessions.length === 0 && skipped.length === 0 ? 'The file has no sessions.' : null };
}

// What an import adds, for the preview: counts, date range, total time and the net result in dollars.
export function importPreview(sessions) {
  const dates = sessions.map((s) => s.date).sort();
  return {
    count: sessions.length,
    cash: sessions.filter((s) => s.format === 'cash').length,
    tournaments: sessions.filter((s) => s.format === 'tournament').length,
    first: dates[0] ?? null,
    last: dates.at(-1) ?? null,
    hours: sessions.reduce((sum, s) => sum + s.durationMin, 0) / 60,
    hands: sessions.reduce((sum, s) => sum + Math.round((s.durationMin / 60) * HANDS_PER_HOUR), 0),
    net: sessions.reduce((sum, s) => sum + sessionProfit(s), 0),
    withNotes: sessions.filter((s) => s.notes).length,
  };
}
