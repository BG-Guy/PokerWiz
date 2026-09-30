// Hand endpoints: list, create (Add Hand flow) and update review fields.
import { request } from './client.js';

export const getHands = () => request('/hands');
export const getHand = (id) => request(`/hands/${id}`);
export const createHand = (hand) => request('/hands', { method: 'POST', body: hand });

// changes: any of { verdict, note, title, tags, rating, tilt, coachAccuracy, coachReads }
export const updateHand = (id, changes) => request(`/hands/${id}`, { method: 'PATCH', body: changes });
