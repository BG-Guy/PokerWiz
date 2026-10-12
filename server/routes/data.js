// Your data in and out: a full backup (JSON) to download and to import back, on this device or another, and
// spreadsheets (CSV) of your sessions and hands. Downloads come as files named with the day's date.
import express, { Router } from 'express';
import { createBackup, importBackup, BACKUP_APP, BACKUP_VERSION } from '../models/backup.js';
import { sessionsCsv, handsCsv } from '../models/spreadsheets.js';
import { GOAL_METRICS } from '../models/goals.js';

export const dataRouter = Router();

// Send `body` as a file to save.
function download(res, name, type, body) {
  res.set('Content-Type', type);
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.set('Cache-Control', 'no-store');
  res.send(body);
}
const today = () => new Date().toISOString().slice(0, 10);

dataRouter.get('/backup', (req, res) => {
  download(res, `pokerwiz-backup-${today()}.json`, 'application/json; charset=utf-8', JSON.stringify(createBackup(), null, 1));
});
dataRouter.get('/sessions.csv', (req, res) => {
  download(res, `pokerwiz-sessions-${today()}.csv`, 'text/csv; charset=utf-8', sessionsCsv());
});
dataRouter.get('/hands.csv', (req, res) => {
  download(res, `pokerwiz-hands-${today()}.csv`, 'text/csv; charset=utf-8', handsCsv());
});

// ----- Checking a backup before anything is saved -----

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;
const isText = (v, max) => typeof v === 'string' && v.length <= max;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const optional = (v, check) => v === null || v === undefined || check(v);

// What's wrong with one session in the file, or null.
function sessionProblem(s) {
  if (!isObject(s) || !isId(s.id)) return 'it has no id';
  if (!isDate(s.date)) return 'the date must look like 2026-10-04';
  for (const key of ['game', 'stakes', 'venue']) {
    if (!isText(s[key], 80) || !s[key].trim()) return `the ${key} is missing`;
  }
  if (!optional(s.status, (v) => v === 'finished' || v === 'live')) return 'its status is unknown';
  if (!optional(s.format, (v) => v === 'cash' || v === 'tournament')) return 'its format is unknown';
  if (!isNumber(s.bigBlind) || s.bigBlind < 0) return 'the big blind must be zero or more';
  for (const key of ['buyIn', 'expenses', 'smallBlind', 'ante']) {
    if (!optional(s[key], (v) => isNumber(v) && v >= 0)) return 'amounts must be zero or more';
  }
  if (!optional(s.cashOut, (v) => isNumber(v) && v >= 0)) return 'the cash-out must be zero or more';
  if (!optional(s.durationMin, isCount) || !optional(s.hands, isCount)) return 'the length and hands must be whole numbers';
  if (!optional(s.rating, (v) => isNumber(v) && v >= 0 && v <= 5)) return 'the rating must be 0 to 5';
  if (!optional(s.tilt, (v) => Number.isInteger(v) && v >= 1 && v <= 5)) return 'the tilt must be 1 to 5';
  if (!optional(s.notes, (v) => isText(v, 20000))) return 'the notes are too long';
  if (!optional(s.startedAt, isTime) || !optional(s.endedAt, isTime)) return 'a start or end time is unreadable';
  if (!optional(s.source, (v) => isText(v, 40)) || !optional(s.externalId, (v) => isText(v, 200))) return 'its import details are unreadable';
  if (!optional(s.events, Array.isArray)) return 'its timeline is unreadable';
  for (const e of s.events ?? []) {
    if (!isObject(e) || !isId(e.id) || !['note', 'rebuy', 'hand'].includes(e.type) || !isTime(e.createdAt)) return 'a timeline entry is unreadable';
    if (!optional(e.text, (v) => isText(v, 20000)) || !optional(e.amount, isNumber) || !optional(e.handId, isId)) return 'a timeline entry is unreadable';
  }
  return null;
}

// What's wrong with one hand in the file, or null.
function handProblem(h) {
  if (!isObject(h) || !isId(h.id)) return 'it has no id';
  if (!isDate(h.date)) return 'the date must look like 2026-10-04';
  if (!isTime(h.createdAt)) return 'its saved time is unreadable';
  if (!optional(h.sessionId, isId)) return 'its session is unreadable';
  if (!isObject(h.data) || !optional(h.data.title, (v) => isText(v, 200))) return 'the hand itself is unreadable';
  return null;
}

// What's wrong with one goal in the file, or null.
function goalProblem(g) {
  if (!isObject(g) || !isId(g.id) || !isNumber(g.position) || !isObject(g.data)) return 'it is unreadable';
  const d = g.data;
  if (!Object.hasOwn(GOAL_METRICS, d.metric ?? '')) return 'what it measures is unknown';
  if (!isText(d.title, 120) || !d.title.trim()) return 'it has no name';
  if (!isNumber(d.target) || d.target <= 0) return 'the target must be more than zero';
  if (!isDate(d.startDate) || !isDate(d.deadline)) return 'its dates are unreadable';
  return null;
}

// What's wrong with the file as a whole, or null (the first problem found, with where it is).
function backupProblem(b) {
  if (!isObject(b) || b.app !== BACKUP_APP) return "This isn't a PokerWiz backup file";
  if (!Number.isInteger(b.version) || b.version < 1) return "This backup's format is unreadable";
  if (b.version > BACKUP_VERSION) return 'This backup comes from a newer version of PokerWiz. Update the app, then import it again.';
  if (!Array.isArray(b.sessions) || !Array.isArray(b.hands) || !Array.isArray(b.goals)) return 'The backup is missing its sessions, hands or goals';
  const checks = [
    ['Session', b.sessions, sessionProblem],
    ['Hand', b.hands, handProblem],
    ['Goal', b.goals, goalProblem],
  ];
  for (const [kind, list, problemOf] of checks) {
    for (const [i, item] of list.entries()) {
      const problem = problemOf(item);
      if (problem) return `${kind} ${i + 1} in the file: ${problem}`;
    }
    if (new Set(list.map((item) => item.id)).size !== list.length) return `The file has the same ${kind.toLowerCase()} twice`;
  }
  const eventIds = b.sessions.flatMap((s) => (s.events ?? []).map((e) => e.id));
  if (new Set(eventIds).size !== eventIds.length) return 'The file has the same timeline entry twice';
  return null;
}

// Import a backup: { backup, removeSamples }. ?dryRun=1 only works out what would happen (the preview).
// Replies { sessions, hands, goals } (each { added, skipped }), liveSkipped, removedSamples.
dataRouter.post('/import', express.json({ limit: '50mb' }), (req, res) => {
  const { backup, removeSamples = false } = req.body ?? {};
  const problem = backupProblem(backup);
  if (problem) return res.status(400).json({ error: problem });
  res.json(importBackup(backup, { dryRun: req.query.dryRun === '1', removeSamples: removeSamples === true }));
});
