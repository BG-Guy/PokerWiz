// Session data access: list, start, timeline events (add, edit, remove), finish, edit, delete, and import
// finished sessions.
// Converts between database rows (snake_case) and API objects (camelCase).
import { randomUUID } from 'node:crypto';
import { db, transaction } from '../db/database.js';

// Local calendar date (YYYY-MM-DD) for a Date.
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toSession(row) {
  return {
    id: row.id,
    date: row.date,
    game: row.game,
    stakes: row.stakes,
    bigBlind: row.big_blind,
    venue: row.venue,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMin: row.duration_min,
    buyIn: row.buy_in,
    cashOut: row.cash_out,
    hands: row.hands,
    notes: row.notes,
    rating: row.rating,
    tilt: row.tilt,
    format: row.format ?? 'cash',
    smallBlind: row.small_blind,
    ante: row.ante,
    expenses: row.expenses ?? 0,
    source: row.source,
    externalId: row.external_id,
  };
}

function toEvent(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    text: row.text,
    amount: row.amount,
    handId: row.hand_id,
    createdAt: row.created_at,
  };
}

// Attach the session's timeline, oldest first.
function withEvents(session) {
  const rows = db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY created_at, rowid').all(session.id);
  return { ...session, events: rows.map(toEvent) };
}

// Finished sessions, newest first (used for history, stats and insights).
export function listFinished() {
  return db
    .prepare("SELECT * FROM sessions WHERE status = 'finished' ORDER BY date DESC, started_at DESC")
    .all()
    .map(toSession);
}

// The running session with its timeline, or null.
export function findLive() {
  const row = db.prepare("SELECT * FROM sessions WHERE status = 'live' LIMIT 1").get();
  return row ? withEvents(toSession(row)) : null;
}

export function findById(id) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  return row ? withEvents(toSession(row)) : null;
}

// Start a new live session now.
export function startSession({ game, stakes, bigBlind, venue, buyIn }) {
  const id = randomUUID();
  const now = new Date();
  db.prepare(`
    INSERT INTO sessions (id, date, game, stakes, big_blind, venue, status, started_at, buy_in)
    VALUES (?, ?, ?, ?, ?, ?, 'live', ?, ?)`).run(id, localDate(now), game, stakes, bigBlind, venue, now.toISOString(), buyIn);
  return findById(id);
}

// Add a note, rebuy or hand to a live session's timeline. Rebuys also raise the total buy-in.
export function addEvent(sessionId, { type, text = '', amount = null, handId = null }) {
  transaction(() => {
    db.prepare(`
      INSERT INTO session_events (id, session_id, type, text, amount, hand_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), sessionId, type, text, amount, handId, new Date().toISOString());
    if (type === 'rebuy') {
      db.prepare('UPDATE sessions SET buy_in = buy_in + ? WHERE id = ?').run(amount, sessionId);
    }
  });
  return findById(sessionId);
}

// Live tables deal about 30 hands an hour; hands played is worked out from the time at the table.
const HANDS_PER_HOUR = 30;

// Close a live session: record cash-out, duration, hands played (from the time), rating and tilt.
export function finishSession(id, { cashOut, rating = null, tilt = null, notes = '' }) {
  const session = findById(id);
  const ended = new Date();
  const durationMin = Math.max(1, Math.round((ended - new Date(session.startedAt)) / 60000));
  const hands = Math.max(1, Math.round((durationMin / 60) * HANDS_PER_HOUR));
  db.prepare(`
    UPDATE sessions
    SET status = 'finished', ended_at = ?, duration_min = ?, cash_out = ?, rating = ?, tilt = ?, notes = ?, hands = ?
    WHERE id = ?`).run(ended.toISOString(), durationMin, cashOut, rating, tilt, notes, hands, id);
  return findById(id);
}

// Delete a session and its timeline (events cascade). Its saved hands stay in Hands, no longer tied to it.
export function deleteSession(id) {
  transaction(() => {
    db.prepare('UPDATE hands SET session_id = NULL WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  });
}

// What can be edited, as API field -> column. A finished session can change everything it records; a live one
// only its setup (game, stakes, venue) and its starting buy-in (startBuyIn, see updateSession).
const FINISHED_COLUMNS = {
  date: 'date',
  game: 'game',
  stakes: 'stakes',
  bigBlind: 'big_blind',
  venue: 'venue',
  durationMin: 'duration_min',
  buyIn: 'buy_in',
  cashOut: 'cash_out',
  expenses: 'expenses',
  hands: 'hands',
  notes: 'notes',
  rating: 'rating',
  tilt: 'tilt',
};
const LIVE_COLUMNS = { game: 'game', stakes: 'stakes', bigBlind: 'big_blind', venue: 'venue' };

// Edit a session. For a live session, startBuyIn sets what you sat down with (rebuys stay on top of it).
export function updateSession(id, changes) {
  const session = findById(id);
  if (!session) return null;
  const columns = session.status === 'live' ? LIVE_COLUMNS : FINISHED_COLUMNS;
  const sets = [];
  const values = [];
  for (const [field, column] of Object.entries(columns)) {
    if (changes[field] === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(changes[field]);
  }
  if (session.status === 'live' && changes.startBuyIn !== undefined) {
    const rebuys = session.events.filter((e) => e.type === 'rebuy').reduce((sum, e) => sum + e.amount, 0);
    sets.push('buy_in = ?');
    values.push(changes.startBuyIn + rebuys);
  }
  if (sets.length) db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  return findById(id);
}

// Edit a timeline entry: a note's text or a rebuy's amount (the buy-in total follows). Returns the session,
// or null if the entry isn't on it.
export function updateEvent(sessionId, eventId, { text, amount }) {
  const event = findById(sessionId)?.events.find((e) => e.id === eventId);
  if (!event) return null;
  transaction(() => {
    if (event.type === 'note' && text !== undefined) db.prepare('UPDATE session_events SET text = ? WHERE id = ?').run(text, eventId);
    if (event.type === 'rebuy' && amount !== undefined) {
      db.prepare('UPDATE session_events SET amount = ? WHERE id = ?').run(amount, eventId);
      db.prepare('UPDATE sessions SET buy_in = buy_in + ? WHERE id = ?').run(amount - event.amount, sessionId);
    }
  });
  return findById(sessionId);
}

// Take an entry off the timeline. A rebuy comes off the buy-in; a hand stays saved in Hands.
export function deleteEvent(sessionId, eventId) {
  const event = findById(sessionId)?.events.find((e) => e.id === eventId);
  if (!event) return null;
  transaction(() => {
    db.prepare('DELETE FROM session_events WHERE id = ?').run(eventId);
    if (event.type === 'rebuy') db.prepare('UPDATE sessions SET buy_in = buy_in - ? WHERE id = ?').run(event.amount, sessionId);
  });
  return findById(sessionId);
}

// Add finished sessions from an import (see routes/sessions.js for the fields), all or nothing. A session
// whose externalId is already in the database is skipped, so importing the same file again adds nothing.
// End time and hands played come from the start and the duration, like live sessions. Returns { imported, skipped }.
export function importSessions(list, { source }) {
  const exists = db.prepare('SELECT 1 FROM sessions WHERE external_id = ?');
  const insert = db.prepare(`
    INSERT INTO sessions (id, date, game, stakes, big_blind, small_blind, ante, venue, status, started_at, ended_at,
                          duration_min, buy_in, cash_out, expenses, hands, notes, format, source, external_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'finished', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  return transaction(() => {
    let imported = 0;
    let skipped = 0;
    for (const s of list) {
      if (exists.get(s.externalId)) {
        skipped++;
        continue;
      }
      const ended = new Date(Date.parse(s.startedAt) + s.durationMin * 60000).toISOString();
      const hands = Math.round((s.durationMin / 60) * HANDS_PER_HOUR);
      insert.run(randomUUID(), s.date, s.game, s.stakes, s.bigBlind, s.smallBlind ?? null, s.ante ?? null, s.venue, s.startedAt, ended,
        s.durationMin, s.buyIn, s.cashOut, s.expenses, hands, s.notes, s.format, source, s.externalId);
      imported++;
    }
    return { imported, skipped };
  });
}

// Undo an import: delete every session that came from this source. Returns how many were removed.
export function removeImported(source) {
  return Number(db.prepare('DELETE FROM sessions WHERE source = ?').run(source).changes);
}
