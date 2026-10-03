// /api/sessions: session history plus the live-session lifecycle (start, timeline events, finish, discard),
// and importing finished sessions from other apps (parsed from a CSV in the browser).
import { Router } from 'express';
import * as Sessions from '../models/sessions.js';
import { countSampleData, removeSampleData } from '../models/sampleData.js';

export const sessionsRouter = Router();

const EVENT_TYPES = ['note', 'rebuy', 'hand'];
const IMPORT_SOURCES = ['regroup'];
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isText = (value, max) => typeof value === 'string' && value.length <= max;

// What's wrong with one imported session, or null. Fields: date (YYYY-MM-DD), startedAt (ISO), format
// (cash | tournament), game, stakes, bigBlind (> 0 for cash, 0 for tournaments), smallBlind/ante (or null),
// venue, durationMin, buyIn, cashOut, expenses, notes, externalId.
function importProblem(s) {
  if (!s || typeof s !== 'object') return 'not a session';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date ?? '') || Number.isNaN(Date.parse(s.startedAt))) return 'a missing or invalid date';
  if (!['cash', 'tournament'].includes(s.format)) return 'an unknown format (cash or tournament)';
  if (!isText(s.game, 12) || !s.game || !isText(s.stakes, 40) || !s.stakes || !isText(s.venue, 80) || !s.venue.trim()) return 'a missing game, stakes or location';
  if (!isNumber(s.bigBlind) || s.bigBlind < 0 || (s.format === 'cash' && s.bigBlind === 0)) return 'a missing big blind';
  for (const key of ['smallBlind', 'ante']) if (s[key] != null && (!isNumber(s[key]) || s[key] < 0)) return `an invalid ${key}`;
  if (!Number.isInteger(s.durationMin) || s.durationMin < 0 || s.durationMin > 72 * 60) return 'an invalid length';
  for (const key of ['buyIn', 'cashOut', 'expenses']) if (!isNumber(s[key]) || s[key] < 0) return `an invalid ${key}`;
  if (!isText(s.notes, 20000) || !isText(s.externalId, 200) || !s.externalId) return 'invalid notes or id';
  return null;
}

// Sample data that came with the app: { sessions, hands } still in the database.
sessionsRouter.get('/samples', (req, res) => {
  res.json(countSampleData());
});

// Import finished sessions in one go (sessions already imported are skipped). removeSamples also deletes the
// sample sessions and hands first. Replies { imported, skipped, removedSamples }.
sessionsRouter.post('/import', (req, res) => {
  const { source, sessions, removeSamples = false } = req.body ?? {};
  if (!IMPORT_SOURCES.includes(source)) return res.status(400).json({ error: 'Unknown import source' });
  if (!Array.isArray(sessions) || sessions.length === 0) return res.status(400).json({ error: 'No sessions to import' });
  if (sessions.length > 5000) return res.status(400).json({ error: 'Import at most 5,000 sessions at a time' });
  for (let i = 0; i < sessions.length; i++) {
    const problem = importProblem(sessions[i]);
    if (problem) return res.status(400).json({ error: `Session ${i + 1} has ${problem}` });
  }
  const removedSamples = removeSamples ? removeSampleData() : null;
  res.status(201).json({ ...Sessions.importSessions(sessions, { source }), removedSamples });
});

// Undo an import: removes every session that came from this source. Replies { removed }.
sessionsRouter.delete('/imported/:source', (req, res) => {
  if (!IMPORT_SOURCES.includes(req.params.source)) return res.status(400).json({ error: 'Unknown import source' });
  res.json({ removed: Sessions.removeImported(req.params.source) });
});

// Look up a session by :id and make sure it is still live; replies with an error otherwise.
function requireLiveSession(req, res) {
  const session = Sessions.findById(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  if (session.status !== 'live') {
    res.status(409).json({ error: 'This session is already finished' });
    return null;
  }
  return session;
}

// Finished sessions, newest first.
sessionsRouter.get('/', (req, res) => {
  res.json(Sessions.listFinished());
});

// The running session (or null).
sessionsRouter.get('/live', (req, res) => {
  res.json(Sessions.findLive());
});

sessionsRouter.get('/:id', (req, res) => {
  const session = Sessions.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Start a session. Only one can run at a time.
sessionsRouter.post('/', (req, res) => {
  if (Sessions.findLive()) return res.status(409).json({ error: 'A session is already running' });
  const { game, stakes, bigBlind, venue, buyIn } = req.body ?? {};
  if (!game || !stakes || !venue || !isNumber(bigBlind) || bigBlind <= 0 || !isNumber(buyIn) || buyIn < 0) {
    return res.status(400).json({ error: 'Game, stakes, venue and a valid buy-in are required' });
  }
  res.status(201).json(Sessions.startSession({ game, stakes, bigBlind, venue, buyIn }));
});

// Add a timeline entry: a note, a rebuy (amount) or a saved hand.
sessionsRouter.post('/:id/events', (req, res) => {
  if (!requireLiveSession(req, res)) return;
  const { type, text = '', amount = null, handId = null } = req.body ?? {};
  if (!EVENT_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown event type' });
  if (type === 'note' && !String(text).trim()) return res.status(400).json({ error: 'A note needs some text' });
  if (type === 'rebuy' && (!isNumber(amount) || amount <= 0)) return res.status(400).json({ error: 'Rebuy amount must be positive' });
  res.status(201).json(Sessions.addEvent(req.params.id, { type, text: String(text).trim(), amount, handId }));
});

// Finish the session with cash-out, rating (0-5) and tilt (1-5). Hands played is computed from the time.
sessionsRouter.post('/:id/finish', (req, res) => {
  if (!requireLiveSession(req, res)) return;
  const { cashOut, rating = null, tilt = null, notes = '' } = req.body ?? {};
  if (!isNumber(cashOut) || cashOut < 0) return res.status(400).json({ error: 'Cash-out must be zero or more' });
  if (rating !== null && (!isNumber(rating) || rating < 0 || rating > 5)) return res.status(400).json({ error: 'Rating must be between 0 and 5' });
  if (tilt !== null && (!Number.isInteger(tilt) || tilt < 1 || tilt > 5)) return res.status(400).json({ error: 'Tilt must be 1 to 5' });
  res.json(Sessions.finishSession(req.params.id, { cashOut, rating, tilt, notes: String(notes) }));
});

// Discard a live session (finished sessions are kept).
sessionsRouter.delete('/:id', (req, res) => {
  if (!requireLiveSession(req, res)) return;
  Sessions.deleteSession(req.params.id);
  res.status(204).end();
});
