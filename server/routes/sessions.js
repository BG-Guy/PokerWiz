// /api/sessions: session history plus the live-session lifecycle (start, timeline events, finish, discard).
import { Router } from 'express';
import * as Sessions from '../models/sessions.js';

export const sessionsRouter = Router();

const EVENT_TYPES = ['note', 'rebuy', 'hand'];
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

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
