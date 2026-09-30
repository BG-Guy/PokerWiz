// Fills an empty database with the sample sessions, hands and goals so the app has data to show.
import { sessions } from '../seed/sessions.js';
import { hands } from '../seed/hands.js';
import { goals } from '../seed/goals.js';

export function seedIfEmpty(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM sessions').get();
  if (count > 0) return;

  const insertSession = db.prepare(`
    INSERT INTO sessions (id, date, game, stakes, big_blind, venue, status, started_at, ended_at,
                          duration_min, buy_in, cash_out, hands, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'finished', ?, ?, ?, ?, ?, ?, ?)`);
  const insertHand = db.prepare('INSERT INTO hands (id, session_id, date, created_at, data) VALUES (?, ?, ?, ?, ?)');
  const insertGoal = db.prepare('INSERT INTO goals (id, position, data) VALUES (?, ?, ?)');

  db.exec('BEGIN');
  try {
    // Sample sessions all start at 7pm on their date.
    for (const s of sessions) {
      const started = new Date(`${s.date}T19:00:00`);
      const ended = new Date(started.getTime() + s.durationMin * 60000);
      insertSession.run(s.id, s.date, s.game, s.stakes, s.bigBlind, s.venue, started.toISOString(), ended.toISOString(),
        s.durationMin, s.buyIn, s.cashOut, s.hands, s.notes);
    }

    // Hands keep id/session/date as columns; everything else goes into the JSON blob.
    hands.forEach(({ id, sessionId, date, ...rest }, index) => {
      insertHand.run(id, sessionId, date, `${date}T20:${String(index).padStart(2, '0')}:00.000Z`, JSON.stringify(rest));
    });

    goals.forEach(({ id, ...rest }, index) => insertGoal.run(id, index, JSON.stringify(rest)));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
