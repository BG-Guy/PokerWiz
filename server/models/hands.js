// Hand data access. The full hand lives as JSON; id, session and date are real columns for sorting/filtering.
import { randomUUID } from 'node:crypto';
import { db, transaction } from '../db/database.js';
import { addEvent, findById as findSession } from './sessions.js';

// Fields that can be edited after saving: the review (verdict, notes, ...), the hand's details
// (stakes, cards, pot, result, ...) from the Edit hand sheet, and players (to correct cards they showed).
// coachAccuracy / coachReads are written by a coach review (score, and the reads it used).
const EDITABLE_FIELDS = [
  'verdict', 'note', 'title', 'tags', 'rating', 'tilt', 'coachAccuracy', 'coachReads',
  'stakes', 'heroPosition', 'holeCards', 'board', 'potSize', 'result', 'players',
];

// Review fields a re-recorded hand keeps from the version it replaces when they aren't sent again.
const KEPT_ON_REPLACE = ['verdict', 'note', 'title', 'tags', 'rating', 'tilt', 'coachReads'];

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

// Edit an existing hand (review fields, details, or its date).
export function updateHand(id, changes) {
  const hand = findHand(id);
  if (!hand) return null;
  const { id: _id, sessionId: _s, date, ...data } = hand;
  for (const field of EDITABLE_FIELDS) {
    if (changes[field] !== undefined) data[field] = changes[field];
  }
  saveHand(id, changes.date ?? date, data);
  return findHand(id);
}

// Swap in a re-recorded version of a hand (new seats, cards and action), keeping its id, session,
// and the review fields the new version doesn't set. The old coach score no longer applies.
export function replaceHand(id, { id: _ignored, sessionId: _s, date, coachAccuracy: _c, ...next }) {
  const hand = findHand(id);
  if (!hand) return null;
  for (const field of KEPT_ON_REPLACE) {
    if (next[field] === undefined && hand[field] !== undefined) next[field] = hand[field];
  }
  saveHand(id, date ?? hand.date, next);
  return findHand(id);
}

// Delete a hand, and its entry on a session timeline.
export function deleteHand(id) {
  transaction(() => {
    db.prepare('DELETE FROM session_events WHERE hand_id = ?').run(id);
    db.prepare('DELETE FROM hands WHERE id = ?').run(id);
  });
}

// Write a hand's data and date; its session timeline entry follows the new title and result.
function saveHand(id, date, data) {
  transaction(() => {
    db.prepare('UPDATE hands SET date = ?, data = ? WHERE id = ?').run(date, JSON.stringify(data), id);
    db.prepare('UPDATE session_events SET text = ?, amount = ? WHERE hand_id = ?').run(data.title ?? 'Hand', data.result ?? null, id);
  });
}
