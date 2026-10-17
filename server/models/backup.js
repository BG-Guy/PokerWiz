// Backups: everything you've recorded (sessions with their live timelines, hands, goals) in one JSON file, and
// bringing such a file back. Importing adds what isn't there yet and skips what is (matched by id, and for
// sessions imported from another app also by that app's key), so importing the same backup twice adds nothing.
import { db, transaction } from '../db/database.js';
import { SAMPLE_SESSION_IDS, SAMPLE_HAND_IDS, deleteSampleRows } from './sampleData.js';

export const BACKUP_APP = 'PokerWiz';
export const BACKUP_VERSION = 1;

// Session fields in the file -> their database columns.
const SESSION_COLUMNS = {
  id: 'id',
  date: 'date',
  game: 'game',
  stakes: 'stakes',
  bigBlind: 'big_blind',
  venue: 'venue',
  status: 'status',
  startedAt: 'started_at',
  endedAt: 'ended_at',
  durationMin: 'duration_min',
  buyIn: 'buy_in',
  cashOut: 'cash_out',
  hands: 'hands',
  notes: 'notes',
  rating: 'rating',
  tilt: 'tilt',
  format: 'format',
  smallBlind: 'small_blind',
  ante: 'ante',
  expenses: 'expenses',
  source: 'source',
  externalId: 'external_id',
};
const SESSION_FIELDS = Object.keys(SESSION_COLUMNS);

// Columns that can't be empty, for files that leave them out.
const DEFAULTS = { status: 'finished', durationMin: 0, buyIn: 0, hands: 0, notes: '', format: 'cash', expenses: 0 };

// ----- Export -----

// The whole database as a backup: { app, version, exportedAt, sessions (with events), hands, goals }.
// Hands and goals keep their stored data as it is ("data"), so a restore gives back exactly the same thing.
export function createBackup() {
  const eventsBySession = new Map();
  for (const e of db.prepare('SELECT * FROM session_events ORDER BY created_at, rowid').all()) {
    const list = eventsBySession.get(e.session_id) ?? [];
    list.push({ id: e.id, type: e.type, text: e.text, amount: e.amount, handId: e.hand_id, createdAt: e.created_at });
    eventsBySession.set(e.session_id, list);
  }
  const sessions = db
    .prepare('SELECT * FROM sessions ORDER BY date, started_at')
    .all()
    .map((row) => ({ ...Object.fromEntries(SESSION_FIELDS.map((field) => [field, row[SESSION_COLUMNS[field]] ?? null])), events: eventsBySession.get(row.id) ?? [] }));
  const hands = db
    .prepare('SELECT * FROM hands ORDER BY date, created_at')
    .all()
    .map((row) => ({ id: row.id, sessionId: row.session_id, date: row.date, createdAt: row.created_at, data: JSON.parse(row.data) }));
  const goals = db
    .prepare('SELECT * FROM goals ORDER BY position')
    .all()
    .map((row) => ({ id: row.id, position: row.position, data: JSON.parse(row.data) }));
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), sessions, hands, goals };
}

// ----- Import -----

// Thrown to roll a dry run back once its counts are known.
class DryRun extends Error {
  constructor(result) {
    super('dry run');
    this.result = result;
  }
}

// Delete every session (their timelines go with them), hand and goal, inside the open transaction. Returns
// how many of each there were.
function deleteEverything() {
  return {
    sessions: Number(db.prepare('DELETE FROM sessions').run().changes),
    hands: Number(db.prepare('DELETE FROM hands').run().changes),
    goals: Number(db.prepare('DELETE FROM goals').run().changes),
  };
}

// Add a backup (checked by routes/data.js) to the database, all or nothing. dryRun: work out what would happen
// and change nothing. removeSamples: delete the sample data that came with the app from this install first.
// The file's own copies of the sample data are always left out: they're made up, not part of anyone's record.
// Returns { sessions, hands, goals } (each { added, skipped }), liveSkipped (a live session in the file while
// one is already running here: it's left out), and removedSamples ({ sessions, hands } or null).
// mode 'add' (the default) adds what isn't here yet; 'replace' first deletes everything here (sessions with their
// timelines, hands, goals, the sample data too), so the backup becomes your data. The result then also says what
// was deleted: replaced { sessions, hands, goals }.
export function importBackup(backup, { dryRun = false, removeSamples = false, mode = 'add' } = {}) {
  try {
    return transaction(() => {
      const replaced = mode === 'replace' ? deleteEverything() : null;
      const result = { ...addBackup(backup, removeSamples && !replaced), replaced };
      if (dryRun) throw new DryRun(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result;
    throw error;
  }
}

function addBackup(backup, removeSamples) {
  const removedSamples = removeSamples ? deleteSampleRows() : null;
  const skipSessions = new Set(SAMPLE_SESSION_IDS);
  const skipHands = new Set(SAMPLE_HAND_IDS);
  const result = { sessions: { added: 0, skipped: 0 }, hands: { added: 0, skipped: 0 }, goals: { added: 0, skipped: 0 }, liveSkipped: false, removedSamples };

  // Sessions, with their timelines. A session is already here when its id is, or its import key (sessions
  // that came from another app). Only one session can be live at a time.
  const sessionExists = db.prepare('SELECT 1 FROM sessions WHERE id = ?');
  const keyExists = db.prepare('SELECT 1 FROM sessions WHERE external_id = ?');
  const liveExists = db.prepare("SELECT 1 FROM sessions WHERE status = 'live'");
  const insertSession = db.prepare(
    `INSERT INTO sessions (${SESSION_FIELDS.map((f) => SESSION_COLUMNS[f]).join(', ')}) VALUES (${SESSION_FIELDS.map(() => '?').join(', ')})`
  );
  const eventExists = db.prepare('SELECT 1 FROM session_events WHERE id = ?');
  const insertEvent = db.prepare('INSERT INTO session_events (id, session_id, type, text, amount, hand_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const s of backup.sessions) {
    if (skipSessions.has(s.id)) continue;
    if (sessionExists.get(s.id) || (s.externalId && keyExists.get(s.externalId))) {
      result.sessions.skipped++;
      continue;
    }
    if (s.status === 'live' && liveExists.get()) {
      result.liveSkipped = true;
      result.sessions.skipped++;
      continue;
    }
    insertSession.run(...SESSION_FIELDS.map((f) => s[f] ?? DEFAULTS[f] ?? null));
    for (const e of s.events ?? []) {
      if (!eventExists.get(e.id)) insertEvent.run(e.id, s.id, e.type, e.text ?? '', e.amount ?? null, e.handId ?? null, e.createdAt);
    }
    result.sessions.added++;
  }

  // Hands. One whose session isn't here (in the database or the file) is kept, just not tied to a session.
  const handExists = db.prepare('SELECT 1 FROM hands WHERE id = ?');
  const insertHand = db.prepare('INSERT INTO hands (id, session_id, date, created_at, data) VALUES (?, ?, ?, ?, ?)');
  for (const h of backup.hands) {
    if (skipHands.has(h.id)) continue;
    if (handExists.get(h.id)) {
      result.hands.skipped++;
      continue;
    }
    const sessionId = h.sessionId && sessionExists.get(h.sessionId) ? h.sessionId : null;
    insertHand.run(h.id, sessionId, h.date, h.createdAt, JSON.stringify(h.data));
    result.hands.added++;
  }

  // Goals, after the ones already here, in the file's order.
  const goalExists = db.prepare('SELECT 1 FROM goals WHERE id = ?');
  const insertGoal = db.prepare('INSERT INTO goals (id, position, data) VALUES (?, ?, ?)');
  let position = (db.prepare('SELECT MAX(position) AS last FROM goals').get().last ?? -1) + 1;
  for (const g of [...backup.goals].sort((a, b) => a.position - b.position)) {
    if (goalExists.get(g.id)) {
      result.goals.skipped++;
      continue;
    }
    insertGoal.run(g.id, position++, JSON.stringify(g.data));
    result.goals.added++;
  }
  return result;
}
