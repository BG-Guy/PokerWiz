// /api/goals: the player's goals.
import { Router } from 'express';
import { listGoals } from '../models/goals.js';

export const goalsRouter = Router();

goalsRouter.get('/', (req, res) => {
  res.json(listGoals());
});
