// Hand data access. The full hand lives as JSON; id, session and date are real columns for sorting/filtering.
import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { addEvent, findById as findSession } from './sessions.js';

// Fields the Hand Review page is allowed to edit after saving.
// coachAccuracy / coachReads are written by a coach review (score, and the reads it used).
const EDITABLE_FIELDS = ['verdict', 'note', 'title', 'tags', 'rating', 'tilt', 'coachAccuracy', 'coachReads'];

function toHand(row) {
  return { ...JSON.parse(row.data), id: row.id, sessionId: row.session_id, date: row.date };
}

// All hands, newest first.
export function listHands() {
  return db.prepare('SELECT * FROM hands ORDER BY date DESC, created_at DESC').all().map(toHand);
}

export function findHand(id) {
  const row = db.prepare('SELECT * FROM hands WHERE id = ?').get(id);
  return row ? toHand(row) : null;
}

// Save a new hand. If it belongs to a live session, it also appears on that session's timeline.
export function createHand({ id: _ignored, sessionId = null, date, ...data }) {
  const id = randomUUID();
  const now = new Date();
  const handDate = date ?? now.toISOString().slice(0, 10);
  db.prepare('INSERT INTO hands (id, session_id, date, created_at, data) VALUES (?, ?, ?, ?, ?)').run(
    id, sessionId, handDate, now.toISOString(), JSON.stringify(data)
  );

  const session = sessionId ? findSession(sessionId) : null;
  if (session?.status === 'live') {
    addEvent(sessionId, { type: 'hand', text: data.title ?? 'Hand', amount: data.result ?? null, handId: id });
  }
  return findHand(id);
}

// Update review fields (verdict, notes, ...) on an existing hand.
export function updateHand(id, changes) {
  const hand = findHand(id);
  if (!hand) return null;
  const { id: _id, sessionId: _s, date: _d, ...data } = hand;
  for (const field of EDITABLE_FIELDS) {
    if (changes[field] !== undefined) data[field] = changes[field];
  }
  db.prepare('UPDATE hands SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
  return findHand(id);
}
