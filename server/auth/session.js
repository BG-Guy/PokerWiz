// Password lock for the whole app. With APP_PASSWORD set (on Render: Environment), every page, script and API
// call needs the password first, except the login page and the health check Render polls. The password lives in
// the environment only, never in the code (the repository is public). A correct password gets a signed cookie
// that lasts 30 days; changing the password signs everyone out. On Render without APP_PASSWORD the app stays
// locked rather than open. Locally without it, the lock is off, so development works as before.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const PASSWORD = process.env.APP_PASSWORD ?? '';
export const COOKIE_NAME = 'pokerwiz_auth';
export const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// The signing key comes from the password, so a new password invalidates every old cookie.
const KEY = createHmac('sha256', 'pokerwiz-auth-v1').update(PASSWORD).digest();

// on: a password is set. locked: deployed on Render (it sets RENDER=true) with no password: nothing opens.
export const lock = { on: PASSWORD !== '', locked: PASSWORD === '' && process.env.RENDER === 'true' };

const sign = (issued) => createHmac('sha256', KEY).update(`v1:${issued}`).digest('base64url');
const sameBytes = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const digest = (text) => createHash('sha256').update(String(text)).digest();

// Does the typed password match? Compared as hashes, in constant time.
export function passwordMatches(input) {
  return lock.on && sameBytes(digest(input), digest(PASSWORD));
}

// A fresh cookie value: "<issued, in seconds>.<signature>".
export function newToken(now = Date.now()) {
  const issued = Math.floor(now / 1000);
  return `${issued}.${sign(issued)}`;
}

// A cookie value we signed, less than 30 days old.
function validToken(token, now = Date.now()) {
  const [issued, signature] = String(token ?? '').split('.');
  if (!/^\d+$/.test(issued ?? '') || !signature) return false;
  const age = now / 1000 - Number(issued);
  if (age < 0 || age > MAX_AGE_SECONDS) return false;
  return sameBytes(Buffer.from(signature), Buffer.from(sign(issued)));
}

// The request's cookies as { name: value }.
function cookiesOf(req) {
  const cookies = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return cookies;
}

export const isSignedIn = (req) => lock.on && validToken(cookiesOf(req)[COOKIE_NAME]);

// The Set-Cookie header: server-only (HttpOnly), same-site, and HTTPS-only when the request came over HTTPS.
export function cookieHeader(req, value, maxAgeSeconds) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${req.secure ? '; Secure' : ''}`;
}

// Everything mounted after this needs the password: API calls get a 401, pages go to the login page (and come
// back afterwards). The site icon stays open so the login page has it.
export function requireLogin(req, res, next) {
  if ((!lock.on && !lock.locked) || isSignedIn(req) || req.path === '/favicon.svg') return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Login required' });
  res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
}
