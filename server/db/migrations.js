// One-time data migrations, run at startup after the schema and seed. Each runs once per database;
// applied names are recorded in the "migrations" table.
import { goals } from '../seed/goals.js';

// Ratings and tilt for the sample hands, so Highlights and hand insights have something to show.
const SAMPLE_HAND_FEELINGS = {
  h1: { rating: 4.5, tilt: 1 },
  h2: { rating: 1.5, tilt: 4 },
  h3: { rating: 3.6, tilt: 2 },
  h4: { rating: 4.2, tilt: 1 },
  h5: { rating: 2.2, tilt: 3 },
  h6: { rating: 4.8, tilt: 1 },
  h7: { rating: 2.8, tilt: 3 },
};

const MIGRATIONS = [
  {
    // Goals are now computed from sessions and hands; untrackable goals (like a VPIP target) are removed.
    name: 'computed-goals-v1',
    run(db) {
      db.exec('DELETE FROM goals');
      const insert = db.prepare('INSERT INTO goals (id, position, data) VALUES (?, ?, ?)');
      goals.forEach(({ id, ...rest }, index) => insert.run(id, index, JSON.stringify(rest)));
    },
  },
  {
    name: 'sample-hand-feelings-v1',
    run(db) {
      const select = db.prepare('SELECT data FROM hands WHERE id = ?');
      const update = db.prepare('UPDATE hands SET data = ? WHERE id = ?');
      for (const [id, feelings] of Object.entries(SAMPLE_HAND_FEELINGS)) {
        const row = select.get(id);
        if (!row) continue;
        const data = JSON.parse(row.data);
        if (data.rating == null) data.rating = feelings.rating;
        if (data.tilt == null) data.tilt = feelings.tilt;
        update.run(JSON.stringify(data), id);
      }
    },
  },
];

export function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT name FROM migrations').all().map((row) => row.name));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.exec('BEGIN');
    try {
      migration.run(db);
      db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
