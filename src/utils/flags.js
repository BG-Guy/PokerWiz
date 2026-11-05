// Flagged decisions: graded decisions you think the engine got wrong, kept on this device (localStorage) until
// you export them as one file (Profile) to have them looked at. Each flag carries the whole hand as it was
// graded, so the exact spot can be replayed through the engine.
import { APP_VERSION } from '../constants/version.js';
import { seedFromString } from '../coach/random.js';
import { todayIso } from './format.js';
import { saveBlob } from './download.js';

const KEY = 'pokerwiz-flags-v1';
const listeners = new Set();

// All flags, newest first ([] when storage is empty or blocked).
export function readFlags() {
  try {
    const flags = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(flags) ? flags : [];
  } catch {
    return [];
  }
}

// Saves the list and tells every open screen. False if the device refused to store it.
function writeFlags(flags) {
  let saved = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(flags));
  } catch {
    saved = false;
  }
  listeners.forEach((listener) => listener(flags));
  return saved;
}

// Call `listener(flags)` whenever the flags change; returns the unsubscribe function.
export function subscribeFlags(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The same decision of the same hand always gets the same id, so flagging it twice is one flag.
export function flagId(source, record, decisionIndex) {
  const hand = JSON.stringify([record.players.map((p) => [p.position, p.cards]), record.streets, record.board]);
  return `${source}-${seedFromString(hand).toString(36)}-${decisionIndex}`;
}

// Flag a graded decision. source: 'review' | 'practice'; record: the hand (report.record); detail: the solve
// budget it was graded with ('full' | 'fast').
export function addFlag({ source, record, detail, decision }) {
  const d = decision;
  const flag = {
    id: flagId(source, record, d.index),
    flaggedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    source,
    detail,
    note: '',
    decisionIndex: d.index,
    // What the engine said, as shown on the card.
    decision: {
      street: d.street,
      board: d.board,
      hand: d.heroHand?.text,
      handClass: d.heroClass,
      pot: d.pot,
      toCall: d.toCall,
      graded: d.graded,
      grade: d.grade?.label ?? null,
      score: d.score,
      you: d.actual?.label ?? null,
      gto: d.best?.label ?? null,
      equity: d.equity ?? null,
      options: (d.options ?? []).map((o) => ({ label: o.label, frequency: o.frequency, ev: o.ev })),
      notes: d.notes ?? [],
      reason: d.reason ?? null,
    },
    record,
  };
  return writeFlags([flag, ...readFlags().filter((f) => f.id !== flag.id)]);
}

export function removeFlag(id) {
  return writeFlags(readFlags().filter((f) => f.id !== id));
}

export function setFlagNote(id, note) {
  return writeFlags(readFlags().map((f) => (f.id === id ? { ...f, note } : f)));
}

export function clearFlags() {
  return writeFlags([]);
}

// Save every flag as one JSON file (on iPhone through the share sheet: AirDrop, Files, Mail...).
export function exportFlags() {
  const flags = readFlags();
  const file = { kind: 'pokerwiz-flags', version: 1, exportedAt: new Date().toISOString(), appVersion: APP_VERSION, flags };
  return saveBlob(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }), `pokerwiz-flags-${todayIso()}.json`);
}
