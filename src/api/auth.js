// Password lock endpoints (server/routes/auth.js): is the lock on, and signing out.
import { request } from './client.js';

// { enabled }: true when the app has a password (so "Log out" makes sense).
export const getAuthStatus = () => request('/auth');
export const logout = () => request('/logout', { method: 'POST' });
