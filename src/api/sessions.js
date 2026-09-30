// Session endpoints: history, and the live session lifecycle.
import { request } from './client.js';

export const getSessions = () => request('/sessions');
export const getLiveSession = () => request('/sessions/live');
export const startSession = (session) => request('/sessions', { method: 'POST', body: session });

// event: { type: 'note' | 'rebuy' | 'hand', text?, amount?, handId? }
export const addSessionEvent = (id, event) => request(`/sessions/${id}/events`, { method: 'POST', body: event });

// result: { cashOut, rating, tilt, notes, hands }
export const finishSession = (id, result) => request(`/sessions/${id}/finish`, { method: 'POST', body: result });
export const discardSession = (id) => request(`/sessions/${id}`, { method: 'DELETE' });
