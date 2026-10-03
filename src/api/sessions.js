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

// Importing from other apps (see utils/csvImport.js).
// payload: { source: 'regroup', sessions, removeSamples } -> { imported, skipped, removedSamples }
export const importSessions = (payload) => request('/sessions/import', { method: 'POST', body: payload });
// Sample sessions and hands that came with the app and are still there: { sessions, hands }
export const getSampleData = () => request('/sessions/samples');
// Undo an import: removes every session from that source -> { removed }
export const removeImportedSessions = (source) => request(`/sessions/imported/${source}`, { method: 'DELETE' });
