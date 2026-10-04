// Hand data access. The full hand lives as JSON; id, session and date are real columns for sorting/filtering.
import { randomUUID } from 'node:crypto';
import { db, transaction } from '../db/database.js';
import { addEvent, findById as findSession } from './sessions.js';

// Fields that can change after a hand is saved: your review (verdict, notes, rating, tilt, tags), the coach's
// score and the reads it used, and the hand itself (title, stakes, cards, board, amounts, and a re-recorded
// action: streets and players). The date is a column of its own (see updateHand).
const EDITABLE_FIELDS = [
  'verdict', 'note', 'title', 'tags', 'rating', 'tilt', 'coachAccuracy', 'coachReads',
  'game', 'stakes', 'tableSize', 'heroPosition', 'holeCards', 'board', 'potSize', 'result', 'streets', 'players',
];

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

// Change an existing hand (any of EDITABLE_FIELDS, plus its date). Its entry on a session timeline follows
// the new title and result.
export function updateHand(id, changes) {
  const hand = findHand(id);
  if (!hand) return null;
  const { id: _id, sessionId: _s, date, ...data } = hand;
  for (const field of EDITABLE_FIELDS) {
    if (changes[field] !== undefined) data[field] = changes[field];
  }
  transaction(() => {
    db.prepare('UPDATE hands SET data = ?, date = ? WHERE id = ?').run(JSON.stringify(data), changes.date ?? date, id);
    db.prepare('UPDATE session_events SET text = ?, amount = ? WHERE hand_id = ?').run(data.title ?? 'Hand', data.result ?? null, id);
  });
  return findHand(id);
}

// Delete a hand, and its entry on a session timeline. Returns false if there was no such hand.
export function deleteHand(id) {
  return transaction(() => {
    db.prepare('DELETE FROM session_events WHERE hand_id = ?').run(id);
    return Number(db.prepare('DELETE FROM hands WHERE id = ?').run(id).changes) > 0;
  });
}
