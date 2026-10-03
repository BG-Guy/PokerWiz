// Goals, measured from real data. Each goal counts its metric between its start date and today
// (or its deadline, if that has passed), with weekly checkpoints for the trend line.
import { db } from '../db/database.js';

const DAY = 86400000;

// Local calendar date (YYYY-MM-DD).
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
const addDays = (iso, days) => localDate(new Date(new Date(`${iso}T12:00:00`).getTime() + days * DAY));

// A metric's total between two dates (inclusive).
function metricValue(metric, from, to) {
  if (metric === 'hands_reviewed') {
    const rows = db.prepare('SELECT data FROM hands WHERE date >= ? AND date <= ?').all(from, to);
    return rows.filter((row) => {
      const hand = JSON.parse(row.data);
      return hand.rating != null || (hand.verdict && hand.verdict !== 'review');
    }).length;
  }
  const sessions = db
    .prepare("SELECT * FROM sessions WHERE status = 'finished' AND date >= ? AND date <= ?")
    .all(from, to);
  switch (metric) {
    case 'hands_played':
      return sessions.reduce((sum, s) => sum + s.hands, 0);
    case 'net_profit':
      return sessions.reduce((sum, s) => sum + (s.cash_out - s.buy_in - (s.expenses ?? 0)), 0);
    case 'hours_played':
      return Math.round(sessions.reduce((sum, s) => sum + s.duration_min, 0) / 6) / 10;
    case 'sessions_played':
      return sessions.length;
    default:
      return 0;
  }
}

export function listGoals() {
  const today = localDate(new Date());
  return db
    .prepare('SELECT * FROM goals ORDER BY position')
    .all()
    .map((row) => {
      const goal = { id: row.id, ...JSON.parse(row.data) };
      const until = today < goal.deadline ? today : goal.deadline;
      // Weekly checkpoints from the start date, then today's value.
      const history = [];
      for (let day = goal.startDate; day < until; day = addDays(day, 7)) history.push(metricValue(goal.metric, goal.startDate, day));
      const current = metricValue(goal.metric, goal.startDate, until);
      history.push(current);
      return { ...goal, start: 0, current, history };
    });
}
