// Password lock routes (see auth/session.js): the login page, signing in and out, and whether the lock is on.
// Mounted before the lock itself, so they're reachable without the password.
import { Router } from 'express';
import { lock, passwordMatches, newToken, cookieHeader, isSignedIn, MAX_AGE_SECONDS } from '../auth/session.js';
import { loginPage } from '../views/loginPage.js';

export const authRouter = Router();

// Wrong passwords per address: after 10 in 15 minutes, sign-in waits until the window ends.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map(); // ip -> { count, resetAt }

function tooManyFailures(ip, now) {
  const entry = failures.get(ip);
  return Boolean(entry && entry.resetAt > now && entry.count >= MAX_FAILURES);
}

function recordFailure(ip, now) {
  const entry = failures.get(ip);
  if (entry && entry.resetAt > now) entry.count += 1;
  else failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  // Forget finished windows now and then, so the map can't grow forever.
  if (failures.size > 5000) for (const [key, value] of failures) if (value.resetAt <= now) failures.delete(key);
}

// The login page. Already signed in (or no lock at all): straight to the app.
authRouter.get('/login', (req, res) => {
  if (isSignedIn(req) || (!lock.on && !lock.locked)) return res.redirect(302, '/');
  res.status(lock.locked ? 503 : 200).set('Cache-Control', 'no-store').type('html').send(loginPage({ locked: lock.locked }));
});

// Sign in with { password }: sets the 30-day cookie.
authRouter.post('/api/login', (req, res) => {
  if (!lock.on) return res.status(lock.locked ? 503 : 400).json({ error: lock.locked ? 'No password is set yet' : 'This app has no password' });
  const now = Date.now();
  if (tooManyFailures(req.ip, now)) return res.status(429).json({ error: 'Too many wrong passwords. Try again in 15 minutes.' });
  if (!passwordMatches(req.body?.password ?? '')) {
    recordFailure(req.ip, now);
    return res.status(401).json({ error: 'Wrong password' });
  }
  failures.delete(req.ip);
  res.set('Set-Cookie', cookieHeader(req, newToken(now), MAX_AGE_SECONDS)).json({ ok: true });
});

// Sign out: clears the cookie.
authRouter.post('/api/logout', (req, res) => {
  res.set('Set-Cookie', cookieHeader(req, '', 0)).json({ ok: true });
});

// Whether a password is set, so the app knows to offer "Log out".
authRouter.get('/api/auth', (req, res) => {
  res.json({ enabled: lock.on });
});
