// Session endpoints: history, the live session lifecycle, and editing sessions and their timelines.
import { request } from './client.js';

export const getSessions = () => request('/sessions');
export const getLiveSession = () => request('/sessions/live');
export const startSession = (session) => request('/sessions', { method: 'POST', body: session });

// event: { type: 'note' | 'rebuy' | 'hand', text?, amount?, handId? }
export const addSessionEvent = (id, event) => request(`/sessions/${id}/events`, { method: 'POST', body: event });

// result: { cashOut, rating, tilt, notes, hands }
export const finishSession = (id, result) => request(`/sessions/${id}/finish`, { method: 'POST', body: result });
// Deletes a live session (discard) or a finished one; its saved hands are kept.
export const deleteSession = (id) => request(`/sessions/${id}`, { method: 'DELETE' });

// changes: { game, stakes, bigBlind, venue, buyIn, notes } and, once finished,
// { date, cashOut, durationMin, hands, rating, tilt }
export const updateSession = (id, changes) => request(`/sessions/${id}`, { method: 'PATCH', body: changes });

// changes: { text } for a note, { amount } for a rebuy. Both return the updated session.
export const updateSessionEvent = (id, eventId, changes) =>
  request(`/sessions/${id}/events/${eventId}`, { method: 'PATCH', body: changes });
export const deleteSessionEvent = (id, eventId) => request(`/sessions/${id}/events/${eventId}`, { method: 'DELETE' });
