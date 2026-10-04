// Goal endpoints: list, add, edit, remove.
import { request } from './client.js';

export const getGoals = () => request('/goals');

// goal: { title, metric, target, startDate, deadline } (metric: hands_played | hours_played | sessions_played |
// net_profit | hands_reviewed)
export const createGoal = (goal) => request('/goals', { method: 'POST', body: goal });
export const updateGoal = (id, changes) => request(`/goals/${id}`, { method: 'PATCH', body: changes });
export const deleteGoal = (id) => request(`/goals/${id}`, { method: 'DELETE' });
