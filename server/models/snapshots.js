// Automatic backups ("snapshots") kept next to the database, in its backups/ folder: a full backup file (the same
// format as the one you download) when the server starts (every update restarts it), once a day while it runs,
// and right before anything that replaces your data. The newest 30 are kept. Nothing is written while the
// database holds only the sample data, and a snapshot identical to the newest one isn't written again.
// On a host with a persistent disk they survive updates and restarts; see Profile > Your data for downloading
// or restoring one.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db, DB_PATH } from '../db/database.js';
import { createBackup } from './backup.js';
import { SAMPLE_SESSION_IDS, SAMPLE_HAND_IDS } from './sampleData.js';
import { goals as sampleGoals } from '../seed/goals.js';

export const SNAPSHOT_DIR = join(dirname(DB_PATH), 'backups');
const KEEP = 30;
const REASONS = ['startup', 'daily', 'before-replace', 'before-restore', 'manual'];
// pokerwiz-2026-10-17T14-05-00-startup-1a2b3c4d.json
const NAME = /^pokerwiz-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([a-z-]+)-([0-9a-f]{8})\.json$/;

// Your own rows (not the sample data the app ships with): { sessions, hands, goals }.
export function countUserData() {
  const count = (table, ids) => {
    const placeholders = ids.map(() => '?').join(', ');
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table}${ids.length ? ` WHERE id NOT IN (${placeholders})` : ''}`).get(...ids).n;
  };
  return {
    sessions: count('sessions', SAMPLE_SESSION_IDS),
    hands: count('hands', SAMPLE_HAND_IDS),
    goals: count('goals', sampleGoals.map((g) => g.id)),
  };
}
const hasUserData = (counts = countUserData()) => counts.sessions + counts.hands + counts.goals > 0;

// What a snapshot's content is (the backup without its export time), to skip writing the same thing twice.
const contentHash = (backup) => createHash('sha256').update(JSON.stringify({ ...backup, exportedAt: null })).digest('hex').slice(0, 8);

// Snapshots on disk, newest first: { name, reason, createdAt, size }.
export function listSnapshots() {
  if (!existsSync(SNAPSHOT_DIR)) return [];
  return readdirSync(SNAPSHOT_DIR)
    .map((name) => ({ name, match: NAME.exec(name) }))
    .filter(({ match }) => match)
    .map(({ name, match }) => ({
      name,
      reason: match[2],
      createdAt: `${match[1].slice(0, 10)}T${match[1].slice(11).replaceAll('-', ':')}Z`,
      hash: match[3],
      size: statSync(join(SNAPSHOT_DIR, name)).size,
    }))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

// Write a snapshot now (reason: one of REASONS). Returns its listing, or null when there was nothing to keep
// (only sample data, or the same as the newest snapshot).
export function takeSnapshot(reason) {
  if (!REASONS.includes(reason)) throw new Error(`Unknown snapshot reason ${reason}`);
  if (!hasUserData()) return null;
  const backup = createBackup();
  const hash = contentHash(backup);
  const newest = listSnapshots()[0];
  if (newest?.hash === hash) return null;
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  const name = `pokerwiz-${stamp}-${reason}-${hash}.json`;
  writeFileSync(join(SNAPSHOT_DIR, name), JSON.stringify(backup));
  for (const old of listSnapshots().slice(KEEP)) unlinkSync(join(SNAPSHOT_DIR, old.name));
  return listSnapshots().find((s) => s.name === name) ?? null;
}

// A snapshot's backup (parsed), or null if there's no such file.
export function readSnapshot(name) {
  if (!NAME.test(name)) return null;
  const path = join(SNAPSHOT_DIR, name);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// Daily snapshots while the server runs: checked every few hours, written when the newest is a day old.
export function startDailySnapshots() {
  const DAY = 24 * 60 * 60 * 1000;
  const check = () => {
    const newest = listSnapshots()[0];
    if (!newest || Date.now() - Date.parse(newest.createdAt) >= DAY) takeSnapshot('daily');
  };
  const timer = setInterval(() => {
    try {
      check();
    } catch (error) {
      console.error('Daily snapshot failed:', error);
    }
  }, 6 * 60 * 60 * 1000);
  timer.unref();
}
