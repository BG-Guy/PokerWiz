// The sample sessions and hands the app ships with (server/seed): how many are still in the database, and
// removing them, so an imported record isn't mixed with made-up results. Only rows with the seed's own ids
// are touched; anything the user recorded stays.
import { db, transaction } from '../db/database.js';
import { sessions as sampleSessions } from '../seed/sessions.js';
import { hands as sampleHands } from '../seed/hands.js';

export const SAMPLE_SESSION_IDS = sampleSessions.map((s) => s.id);
export const SAMPLE_HAND_IDS = sampleHands.map((h) => h.id);
const placeholders = (ids) => ids.map(() => '?').join(', ');

// { sessions, hands }: sample rows still in the database.
export function countSampleData() {
  const count = (table, ids) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id IN (${placeholders(ids)})`).get(...ids).n;
  return { sessions: count('sessions', SAMPLE_SESSION_IDS), hands: count('hands', SAMPLE_HAND_IDS) };
}

// Delete the sample sessions (their timeline events go with them) and sample hands. Returns what was removed.
// deleteSampleRows works inside a transaction that's already open (a backup import); removeSampleData opens one.
export function deleteSampleRows() {
  return {
    sessions: Number(db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders(SAMPLE_SESSION_IDS)})`).run(...SAMPLE_SESSION_IDS).changes),
    hands: Number(db.prepare(`DELETE FROM hands WHERE id IN (${placeholders(SAMPLE_HAND_IDS)})`).run(...SAMPLE_HAND_IDS).changes),
  };
}
export const removeSampleData = () => transaction(deleteSampleRows);
