// Your data in and out (server/routes/data.js): download links for the backup and the spreadsheets, importing
// a backup file (dryRun first, for the preview), and the automatic backups the server keeps.
import { request } from './client.js';

// Plain links: the server sends each one as a file to save.
export const DOWNLOADS = {
  backup: '/api/data/backup',
  sessions: '/api/data/sessions.csv',
  hands: '/api/data/hands.csv',
};

// backup: the parsed file. mode: 'add' (on top of your data) or 'replace' (instead of it; an automatic backup
// of what's here is saved first). Replies { sessions, hands, goals } (each { added, skipped }), liveSkipped,
// removedSamples ({ sessions, hands } or null), replaced ({ sessions, hands, goals } deleted, or null) and
// snapshot (the automatic backup saved first, or null). dryRun: only say what would happen.
export const importBackup = (backup, { dryRun = false, removeSamples = false, mode = 'add' } = {}) =>
  request(`/data/import${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', body: { backup, removeSamples, mode } });

// The whole backup as data (for the copy kept on this device).
export const getBackup = () => request('/data/backup');

// { userData: { sessions, hands, goals } (yours, not the sample data), snapshots: { count, newest } }
export const getDataStatus = () => request('/data/status');

// Automatic backups kept by the server, newest first: [{ name, reason, createdAt, size }].
export const getSnapshots = () => request('/data/snapshots');
// Save one now: the new one, or null when nothing changed since the last.
export const saveSnapshot = () => request('/data/snapshots', { method: 'POST' });
// Put one back (it replaces your data; what's here is saved first).
export const restoreSnapshot = (name) => request(`/data/snapshots/${encodeURIComponent(name)}/restore`, { method: 'POST' });
export const snapshotUrl = (name) => `/api/data/snapshots/${encodeURIComponent(name)}`;
