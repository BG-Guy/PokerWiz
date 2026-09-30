// PokerWiz API server (Express). Serves /api/*, and the built frontend from dist/ when it exists.
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionsRouter } from './routes/sessions.js';
import { handsRouter } from './routes/hands.js';
import { goalsRouter } from './routes/goals.js';

const PORT = Number(process.env.PORT ?? 3001);
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const app = express();
app.use(express.json({ limit: '1mb' }));

// API routes
app.get('/api/health', (req, res) => res.json({ ok: true }));
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
});
