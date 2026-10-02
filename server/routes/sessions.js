// /api/sessions: session history plus the live-session lifecycle (start, timeline events, finish, discard),
// and editing or deleting any session and its timeline entries.
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

// Checks the fields of a session edit; returns an error message, or null when they are fine.
function invalidSessionEdit(changes) {
  const { date, game, stakes, bigBlind, venue, buyIn, cashOut, durationMin, hands, rating, tilt, notes } = changes;
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date must look like YYYY-MM-DD';
  if ((game !== undefined && !game) || (stakes !== undefined && !stakes) || (venue !== undefined && !venue)) return 'Game, stakes and venue are required';
  if (bigBlind !== undefined && !(isNumber(bigBlind) && bigBlind > 0)) return 'The big blind must be positive';
  if (buyIn !== undefined && !(isNumber(buyIn) && buyIn >= 0)) return 'Buy-in must be zero or more';
  if (cashOut !== undefined && !(isNumber(cashOut) && cashOut >= 0)) return 'Cash-out must be zero or more';
  if (durationMin !== undefined && !(Number.isInteger(durationMin) && durationMin > 0)) return 'Time played must be at least a minute';
  if (hands !== undefined && !(Number.isInteger(hands) && hands >= 0)) return 'Hands played must be zero or more';
  if (rating !== undefined && rating !== null && !(isNumber(rating) && rating >= 0 && rating <= 5)) return 'Rating must be between 0 and 5';
  if (tilt !== undefined && tilt !== null && !(Number.isInteger(tilt) && tilt >= 1 && tilt <= 5)) return 'Tilt must be 1 to 5';
  if (notes !== undefined && typeof notes !== 'string') return 'Notes must be text';
  return null;
}

// Look up a session and one of its timeline events by :id and :eventId; replies 404 when missing.
function requireEvent(req, res) {
  if (!Sessions.findById(req.params.id)) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  const event = Sessions.findEvent(req.params.id, req.params.eventId);
  if (!event) res.status(404).json({ error: 'Timeline entry not found' });
  return event;
}

// Edit a session: stakes, venue, buy-in and notes at any time; date, cash-out, time, hands,
// rating and tilt once it is finished.
sessionsRouter.patch('/:id', (req, res) => {
  if (!Sessions.findById(req.params.id)) return res.status(404).json({ error: 'Session not found' });
  const changes = req.body ?? {};
  const problem = invalidSessionEdit(changes);
  if (problem) return res.status(400).json({ error: problem });
  res.json(Sessions.updateSession(req.params.id, changes));
});

// Edit a timeline entry: a note's text or a rebuy's amount.
sessionsRouter.patch('/:id/events/:eventId', (req, res) => {
  const event = requireEvent(req, res);
  if (!event) return;
  const { text, amount } = req.body ?? {};
  if (event.type === 'note' && text !== undefined && !String(text).trim()) return res.status(400).json({ error: 'A note needs some text' });
  if (event.type === 'rebuy' && amount !== undefined && !(isNumber(amount) && amount > 0)) return res.status(400).json({ error: 'Rebuy amount must be positive' });
  res.json(Sessions.updateEvent(req.params.id, event.id, { text: text === undefined ? undefined : String(text).trim(), amount }));
});

sessionsRouter.delete('/:id/events/:eventId', (req, res) => {
  const event = requireEvent(req, res);
  if (!event) return;
  res.json(Sessions.deleteEvent(req.params.id, event.id));
});

// Delete a session, live (discard) or finished. Hands saved in it are kept.
sessionsRouter.delete('/:id', (req, res) => {
  if (!Sessions.findById(req.params.id)) return res.status(404).json({ error: 'Session not found' });
  Sessions.deleteSession(req.params.id);
  res.status(204).end();
});
