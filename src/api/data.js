// Your data in and out (server/routes/data.js): download links for the backup and the spreadsheets, and
// importing a backup file (dryRun first, for the preview).
import { request } from './client.js';

// Plain links: the server sends each one as a file to save.
export const DOWNLOADS = {
  backup: '/api/data/backup',
  sessions: '/api/data/sessions.csv',
  hands: '/api/data/hands.csv',
};

// backup: the parsed file. Replies { sessions, hands, goals } (each { added, skipped }), liveSkipped,
// removedSamples ({ sessions, hands } or null). dryRun: only say what would happen.
export const importBackup = (backup, { dryRun = false, removeSamples = false } = {}) =>
  request(`/data/import${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', body: { backup, removeSamples } });
