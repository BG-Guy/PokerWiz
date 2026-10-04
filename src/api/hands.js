// Hand endpoints: list, create (Add Hand flow), edit and delete.
import { request } from './client.js';

export const getHands = () => request('/hands');
export const getHand = (id) => request(`/hands/${id}`);
export const createHand = (hand) => request('/hands', { method: 'POST', body: hand });

// changes: the review (verdict, note, rating, tilt, tags), the coach's (coachAccuracy, coachReads), or the hand
// itself (title, date, stakes, holeCards, board, potSize, result, and streets/players when re-recorded)
export const updateHand = (id, changes) => request(`/hands/${id}`, { method: 'PATCH', body: changes });
export const deleteHand = (id) => request(`/hands/${id}`, { method: 'DELETE' });
