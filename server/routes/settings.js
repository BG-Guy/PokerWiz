// /api/settings: your profile (name, nickname, home casino, usual stakes...) and app preferences, read and
// changed a few at a time. See models/settings.js for every setting and its check.
import { Router } from 'express';
import { getSettings, saveSettings, settingsProblem } from '../models/settings.js';

export const settingsRouter = Router();

// Every setting, with defaults for the ones never set.
settingsRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getSettings());
});

// Change some settings ({ key: value }; null clears one). Replies every setting.
settingsRouter.patch('/', (req, res) => {
  const problem = settingsProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  res.json(saveSettings(req.body));
});
