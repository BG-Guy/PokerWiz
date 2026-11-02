// Settings: who you are at the table (name, nickname, home casino, usual stakes, favorite game, playing since),
// a few app preferences (the starting buy-in), and the custom stakes you've played. One row per setting in the
// "settings" table, values stored as JSON. Only the settings listed here exist; each one is checked before saving.
import { db, transaction } from '../db/database.js';

const isText = (max) => (v) => typeof v === 'string' && v.length <= max;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isAmount = (v) => isNumber(v) && v >= 0 && v <= 1_000_000;

// One saved custom stake: blinds (sb optional), ante and straddle (optional), the game, and table details.
function isCustomStake(s) {
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return false;
  if (!isText(40)(s.label) || !s.label.trim()) return false;
  if (!isAmount(s.bb) || s.bb <= 0) return false;
  for (const key of ['sb', 'ante', 'straddle']) if (s[key] != null && !isAmount(s[key])) return false;
  if (s.game != null && !['NLH', 'PLO'].includes(s.game)) return false;
  if (s.tableSize != null && !(Number.isInteger(s.tableSize) && s.tableSize >= 2 && s.tableSize <= 10)) return false;
  if (s.tableName != null && !isText(60)(s.tableName)) return false;
  return true;
}

// Every setting: its default and its check. null (or the default) means "not set".
const SETTINGS = {
  name: { fallback: '', valid: isText(60) },
  nickname: { fallback: '', valid: isText(40) },
  homeCasino: { fallback: '', valid: isText(80) },
  usualStakes: { fallback: '', valid: isText(40) },
  favoriteGame: { fallback: '', valid: (v) => ['', 'NLH', 'PLO'].includes(v) },
  playingSince: { fallback: null, valid: (v) => Number.isInteger(v) && v >= 1950 && v <= 2100 },
  // Starting buy-in the session form suggests, in big blinds.
  buyInDepth: { fallback: 100, valid: (v) => Number.isInteger(v) && v >= 10 && v <= 1000 },
  // Custom stakes you've played, newest first (shown as buttons when you start a session).
  customStakes: { fallback: [], valid: (v) => Array.isArray(v) && v.length <= 8 && v.every(isCustomStake) },
};
export const SETTING_KEYS = Object.keys(SETTINGS);

// What's wrong with a set of settings, or null. Unknown keys are refused; null clears a setting.
export function settingsProblem(changes) {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) return 'Settings must be an object';
  for (const [key, value] of Object.entries(changes)) {
    if (!Object.hasOwn(SETTINGS, key)) return `Unknown setting: ${key}`;
    if (value !== null && !SETTINGS[key].valid(value)) return `The ${key} setting is invalid`;
  }
  return null;
}

// Just the settings this version knows (a backup from a newer one may have more).
export const knownSettings = (settings) => Object.fromEntries(Object.entries(settings).filter(([key]) => Object.hasOwn(SETTINGS, key)));

// Only the settings that have been saved: { key: value }. This is what goes into a backup.
export function storedSettings() {
  const stored = {};
  for (const row of db.prepare('SELECT key, value FROM settings ORDER BY key').all()) {
    if (Object.hasOwn(SETTINGS, row.key)) stored[row.key] = JSON.parse(row.value);
  }
  return stored;
}

// Every setting, with defaults filled in.
export function getSettings() {
  const defaults = Object.fromEntries(SETTING_KEYS.map((key) => [key, SETTINGS[key].fallback]));
  return { ...defaults, ...storedSettings() };
}

// Save changes (already checked with settingsProblem). null clears a setting back to its default. Text is trimmed.
// Runs inside an open transaction when there is one (backup import), otherwise in its own.
export function saveSettings(changes, { inTransaction = false } = {}) {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const remove = db.prepare('DELETE FROM settings WHERE key = ?');
  const work = () => {
    for (const [key, raw] of Object.entries(changes)) {
      const value = typeof raw === 'string' ? raw.trim() : raw;
      if (value === null) remove.run(key);
      else upsert.run(key, JSON.stringify(value));
    }
  };
  if (inTransaction) work();
  else transaction(work);
  return getSettings();
}

// Delete every saved setting (inside the open transaction). Returns how many there were.
export function clearSettings() {
  return Number(db.prepare('DELETE FROM settings').run().changes);
}
