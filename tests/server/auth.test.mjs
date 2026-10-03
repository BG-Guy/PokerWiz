// Password lock tests: starts the real server three ways (password set, deployed on Render without a password,
// local without a password) on a throwaway database and checks what's open and what isn't, over HTTP.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let nextPort = 3170 + Math.floor(Math.random() * 400);

// Start server/index.js with these environment variables; resolves with { base, stop } once it listens.
function startServer(env) {
  const port = nextPort++;
  const dir = mkdtempSync(join(tmpdir(), 'pokerwiz-auth-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, PORT: String(port), POKERWIZ_DB: join(dir, 'test.db'), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('running on')) {
        resolve({
          base: `http://localhost:${port}`,
          stop: () => {
            child.kill();
            rmSync(dir, { recursive: true, force: true });
          },
        });
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited (${code})`)));
  });
}

const get = (base, path, cookie) => fetch(`${base}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const login = (base, password) =>
  fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });

describe('with a password set', () => {
  let server;
  before(async () => {
    server = await startServer({ APP_PASSWORD: 'correct horse' });
  });
  after(() => server.stop());

  it('keeps the health check and the login page open', async () => {
    assert.equal((await get(server.base, '/api/health')).status, 200);
    const page = await get(server.base, '/login');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<form id="login"/);
    assert.deepEqual(await (await get(server.base, '/api/auth')).json(), { enabled: true });
  });

  it('blocks the API and sends pages to the login page', async () => {
    const api = await get(server.base, '/api/sessions');
    assert.equal(api.status, 401);
    assert.deepEqual(await api.json(), { error: 'Login required' });
    const page = await get(server.base, '/profile?x=1');
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/login?next=%2Fprofile%3Fx%3D1');
  });

  it('refuses a wrong password', async () => {
    const reply = await login(server.base, 'wrong');
    assert.equal(reply.status, 401);
    assert.equal(reply.headers.get('set-cookie'), null);
  });

  it('opens everything with the right password, until signing out', async () => {
    const reply = await login(server.base, 'correct horse');
    assert.equal(reply.status, 200);
    const setCookie = reply.headers.get('set-cookie');
    assert.match(setCookie, /^pokerwiz_auth=\d+\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
    const cookie = setCookie.split(';')[0];
    assert.equal((await get(server.base, '/api/sessions', cookie)).status, 200);
    assert.equal((await get(server.base, '/login', cookie)).headers.get('location'), '/');

    // A forged or altered cookie doesn't work.
    assert.equal((await get(server.base, '/api/sessions', `${cookie}x`)).status, 401);
    assert.equal((await get(server.base, '/api/sessions', 'pokerwiz_auth=9999999999.abc')).status, 401);

    const out = await fetch(`${server.base}/api/logout`, { method: 'POST', headers: { cookie } });
    assert.match(out.headers.get('set-cookie'), /^pokerwiz_auth=; .*Max-Age=0/);
  });

  it('stops answering after 10 wrong passwords, even the right one', async () => {
    for (let i = 0; i < 10; i++) assert.equal((await login(server.base, `guess ${i}`)).status, 401);
    assert.equal((await login(server.base, 'correct horse')).status, 429);
  });
});

describe('deployed on Render without a password', () => {
  let server;
  before(async () => {
    server = await startServer({ RENDER: 'true' });
  });
  after(() => server.stop());

  it('stays locked: nothing opens, and the login page says how to set a password', async () => {
    assert.equal((await get(server.base, '/api/health')).status, 200);
    assert.equal((await get(server.base, '/api/sessions')).status, 401);
    assert.equal((await get(server.base, '/')).status, 302);
    const page = await get(server.base, '/login');
    assert.equal(page.status, 503);
    assert.match(await page.text(), /APP_PASSWORD/);
    assert.equal((await login(server.base, '')).status, 503);
  });
});

describe('local without a password', () => {
  let server;
  before(async () => {
    server = await startServer({});
  });
  after(() => server.stop());

  it('is open, as before', async () => {
    assert.equal((await get(server.base, '/api/sessions')).status, 200);
    assert.equal((await get(server.base, '/login')).headers.get('location'), '/');
    assert.deepEqual(await (await get(server.base, '/api/auth')).json(), { enabled: false });
  });
});
