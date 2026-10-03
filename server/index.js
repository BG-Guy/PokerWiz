// PokerWiz API server (Express). Serves /api/*, and the built frontend from dist/ when it exists.
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionsRouter } from './routes/sessions.js';
import { handsRouter } from './routes/hands.js';
import { goalsRouter } from './routes/goals.js';
import { authRouter } from './routes/auth.js';
import { lock, requireLogin } from './auth/session.js';

const PORT = Number(process.env.PORT ?? 3001);
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const app = express();
app.set('trust proxy', 1); // behind Render's proxy: the real client address, and HTTPS for secure cookies
app.use(express.json({ limit: '5mb' })); // room for a big session import with notes

// Open to everyone: the health check Render polls, and the login page and sign-in.
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use(authRouter);

// Everything below (API and the app itself) needs the password when one is set (see auth/session.js).
app.use(requireLogin);

// API routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/hands', handsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Production: serve the built app, falling back to index.html for client-side routes.
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res) => res.sendFile(join(distDir, 'index.html')));
}

// Anything that throws ends up here as a JSON 500.
app.use((error, req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(PORT, () => {
  console.log(`PokerWiz API running on http://localhost:${PORT}`);
  // Say whether the app is password-protected, so a missing APP_PASSWORD is easy to spot in the logs.
  if (lock.on) console.log('Password lock: on (APP_PASSWORD is set).');
  else if (lock.locked) console.log('Password lock: LOCKED. Set APP_PASSWORD in the environment to open the app.');
  else console.log('Password lock: off (no APP_PASSWORD; fine for local development).');
});
