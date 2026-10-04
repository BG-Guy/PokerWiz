// /api/goals: the player's goals: list, add, edit and remove.
import { Router } from 'express';
import { listGoals, createGoal, updateGoal, removeGoal, GOAL_METRICS } from '../models/goals.js';

export const goalsRouter = Router();

const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// What's wrong with a goal from the editor, or null. partial: only check the fields present (edits).
function goalProblem(g, partial = false) {
  if (!g || typeof g !== 'object') return 'No goal sent';
  const has = (key) => !partial || g[key] !== undefined;
  if (has('title') && (typeof g.title !== 'string' || !g.title.trim() || g.title.length > 120)) return 'A goal needs a name (up to 120 characters)';
  if (has('metric') && !Object.hasOwn(GOAL_METRICS, g.metric ?? '')) return 'Pick what the goal measures';
  if (has('target') && !(typeof g.target === 'number' && Number.isFinite(g.target) && g.target > 0)) return 'The target must be more than zero';
  if (has('startDate') && !isDate(g.startDate)) return 'The start date must look like 2026-10-04';
  if (has('deadline') && !isDate(g.deadline)) return 'The deadline must look like 2026-12-31';
  if (g.startDate && g.deadline && g.deadline <= g.startDate) return 'The deadline must come after the start date';
  return null;
}

goalsRouter.get('/', (req, res) => {
  res.json(listGoals());
});

// New goal: { title, metric, target, startDate, deadline }.
goalsRouter.post('/', (req, res) => {
  const problem = goalProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  res.status(201).json(createGoal(req.body));
});

// Edit a goal (any of the same fields).
goalsRouter.patch('/:id', (req, res) => {
  const problem = goalProblem(req.body, true);
  if (problem) return res.status(400).json({ error: problem });
  const goal = updateGoal(req.params.id, req.body);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  res.json(goal);
});

goalsRouter.delete('/:id', (req, res) => {
  if (!removeGoal(req.params.id)) return res.status(404).json({ error: 'Goal not found' });
  res.status(204).end();
});
