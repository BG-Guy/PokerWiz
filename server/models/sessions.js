// Session data access: list, start, edit, timeline events (add, edit, remove), finish, delete.
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

// Session fields that can be edited, API name -> column. Live sessions only take the first group
// (cash-out, duration and the rest are set when the session is finished).
const LIVE_FIELDS = { game: 'game', stakes: 'stakes', bigBlind: 'big_blind', venue: 'venue', buyIn: 'buy_in', notes: 'notes' };
const FINISHED_FIELDS = {
  ...LIVE_FIELDS,
  date: 'date',
  cashOut: 'cash_out',
  durationMin: 'duration_min',
  hands: 'hands',
  rating: 'rating',
  tilt: 'tilt',
};

// Edit a session. Unknown fields, and fields that don't apply to its status, are ignored.
export function updateSession(id, changes) {
  const session = findById(id);
  const fields = session.status === 'live' ? LIVE_FIELDS : FINISHED_FIELDS;
  const entries = Object.entries(fields).filter(([key]) => changes[key] !== undefined);
  if (entries.length > 0) {
    const assignments = entries.map(([, column]) => `${column} = ?`).join(', ');
    db.prepare(`UPDATE sessions SET ${assignments} WHERE id = ?`).run(...entries.map(([key]) => changes[key]), id);
  }
  return findById(id);
}

export function findEvent(sessionId, eventId) {
  const row = db.prepare('SELECT * FROM session_events WHERE id = ? AND session_id = ?').get(eventId, sessionId);
  return row ? toEvent(row) : null;
}

// Change a note's text or a rebuy's amount (the session's total buy-in moves with it).
export function updateEvent(sessionId, eventId, { text, amount }) {
  const event = findEvent(sessionId, eventId);
  transaction(() => {
    if (event.type === 'note' && text !== undefined) {
      db.prepare('UPDATE session_events SET text = ? WHERE id = ?').run(text, eventId);
    }
    if (event.type === 'rebuy' && amount !== undefined) {
      db.prepare('UPDATE session_events SET amount = ? WHERE id = ?').run(amount, eventId);
      db.prepare('UPDATE sessions SET buy_in = buy_in + ? WHERE id = ?').run(amount - event.amount, sessionId);
    }
  });
  return findById(sessionId);
}

// Remove a timeline entry. A removed rebuy comes off the buy-in; a removed hand stays in Hand Review.
export function deleteEvent(sessionId, eventId) {
  const event = findEvent(sessionId, eventId);
  transaction(() => {
    db.prepare('DELETE FROM session_events WHERE id = ?').run(eventId);
    if (event.type === 'rebuy') db.prepare('UPDATE sessions SET buy_in = buy_in - ? WHERE id = ?').run(event.amount, sessionId);
  });
  return findById(sessionId);
}

// Delete a session and its timeline (events cascade). Its saved hands stay, no longer tied to it.
export function deleteSession(id) {
  transaction(() => {
    db.prepare('UPDATE hands SET session_id = NULL WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  });
}
