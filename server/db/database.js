// Opens the SQLite database (Node's built-in node:sqlite), applies the schema and seeds it on first run.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedIfEmpty } from './seed.js';
import { runMigrations } from './migrations.js';

const here = dirname(fileURLToPath(import.meta.url));

// Database file lives in server/data/ (git-ignored). Override with POKERWIZ_DB if needed.
const DB_PATH = process.env.POKERWIZ_DB ?? join(here, '..', 'data', 'pokerwiz.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
seedIfEmpty(db);
runMigrations(db);

// Run several statements as one all-or-nothing transaction.
export function transaction(work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
