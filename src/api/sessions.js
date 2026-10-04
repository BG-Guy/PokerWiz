// Session endpoints: history, and the live session lifecycle.
import { request } from './client.js';

export const getSessions = () => request('/sessions');
export const getLiveSession = () => request('/sessions/live');
export const startSession = (session) => request('/sessions', { method: 'POST', body: session });

// event: { type: 'note' | 'rebuy' | 'hand', text?, amount?, handId? }
export const addSessionEvent = (id, event) => request(`/sessions/${id}/events`, { method: 'POST', body: event });

// result: { cashOut, rating, tilt, notes, hands }
export const finishSession = (id, result) => request(`/sessions/${id}/finish`, { method: 'POST', body: result });
// Discard a live session, or delete a finished one (its saved hands are kept).
export const discardSession = (id) => request(`/sessions/${id}`, { method: 'DELETE' });
export const deleteSession = discardSession;

// Edit a session. Finished: date, game, stakes, bigBlind, venue, durationMin, buyIn, cashOut, expenses, hands,
// notes, rating, tilt. Live: game, stakes, bigBlind, venue, startBuyIn (what you sat down with).
export const updateSession = (id, changes) => request(`/sessions/${id}`, { method: 'PATCH', body: changes });

// A live session's timeline entries: edit a note's text or a rebuy's amount, or remove an entry.
export const updateSessionEvent = (id, eventId, changes) => request(`/sessions/${id}/events/${eventId}`, { method: 'PATCH', body: changes });
export const deleteSessionEvent = (id, eventId) => request(`/sessions/${id}/events/${eventId}`, { method: 'DELETE' });

// Importing from other apps (see utils/csvImport.js).
// payload: { source: 'regroup', sessions, removeSamples } -> { imported, skipped, removedSamples }
export const importSessions = (payload) => request('/sessions/import', { method: 'POST', body: payload });
// Sample sessions and hands that came with the app and are still there: { sessions, hands }
export const getSampleData = () => request('/sessions/samples');
// Undo an import: removes every session from that source -> { removed }
export const removeImportedSessions = (source) => request(`/sessions/imported/${source}`, { method: 'DELETE' });
