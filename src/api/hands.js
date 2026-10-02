// Hand endpoints: list, create (Add Hand flow), edit, re-record and delete.
import { request } from './client.js';

export const getHands = () => request('/hands');
export const getHand = (id) => request(`/hands/${id}`);
export const createHand = (hand) => request('/hands', { method: 'POST', body: hand });

// changes: review fields { verdict, note, rating, tilt, coachAccuracy, coachReads }
// or details { title, date, stakes, heroPosition, holeCards, board, potSize, result, tags, players }
export const updateHand = (id, changes) => request(`/hands/${id}`, { method: 'PATCH', body: changes });

// Swap in a re-recorded version of the hand (same shape as createHand); review fields not sent are kept.
export const replaceHand = (id, hand) => request(`/hands/${id}`, { method: 'PUT', body: hand });
export const deleteHand = (id) => request(`/hands/${id}`, { method: 'DELETE' });
