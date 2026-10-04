// Goals, measured from real data. Each goal counts its metric between its start date and today
// (or its deadline, if that has passed), with weekly checkpoints for the trend line. Goals can be added,
// edited and removed (the Goals page).
import { randomUUID } from 'node:crypto';
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

// What each metric counts, its unit and the kind of goal it is (the category picks the goal's advice).
export const GOAL_METRICS = {
  hands_played: { unit: 'hands', category: 'Volume' },
  hours_played: { unit: 'hours', category: 'Volume' },
  sessions_played: { unit: 'sessions', category: 'Volume' },
  net_profit: { unit: '$', category: 'Results' },
  hands_reviewed: { unit: 'hands', category: 'Study' },
};

// A goal's stored fields from the editor's: title, metric, target, startDate, deadline.
function goalData({ title, metric, target, startDate, deadline }) {
  const { unit, category } = GOAL_METRICS[metric];
  return { title: title.trim(), metric, unit, category, target, startDate, deadline };
}
const findGoal = (id) => listGoals().find((goal) => goal.id === id) ?? null;

// New goal, added at the end of the list.
export function createGoal(fields) {
  const id = randomUUID();
  const position = (db.prepare('SELECT MAX(position) AS last FROM goals').get().last ?? -1) + 1;
  db.prepare('INSERT INTO goals (id, position, data) VALUES (?, ?, ?)').run(id, position, JSON.stringify(goalData(fields)));
  return findGoal(id);
}

// Change a goal (any editor fields; the rest stay as they were).
export function updateGoal(id, fields) {
  const row = db.prepare('SELECT data FROM goals WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare('UPDATE goals SET data = ? WHERE id = ?').run(JSON.stringify(goalData({ ...JSON.parse(row.data), ...fields })), id);
  return findGoal(id);
}

// Remove a goal. Returns false if there was no such goal.
export function removeGoal(id) {
  return Number(db.prepare('DELETE FROM goals WHERE id = ?').run(id).changes) > 0;
}
