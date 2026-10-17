// Keeping your data safe: it survives a restart (an update restarts the server), automatic backups are saved
// when the server starts and before your data is replaced, a backup can be imported on top of your data or
// instead of it, and an automatic backup can be put back. Real servers on throwaway databases.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const running = new Set();
const dirs = [];

// A server on the database in `dir` (a new throwaway one if not given), with a JSON helper and stop().
async function startServer(dir = mkdtempSync(join(tmpdir(), 'pokerwiz-safety-'))) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const port = 4300 + Math.floor(Math.random() * 600);
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), POKERWIZ_DB: join(dir, 'test.db') },
    stdio: 'ignore',
  });
  running.add(proc);
  const base = `http://localhost:${port}/api`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  const stop = () =>
    new Promise((resolve) => {
      proc.once('exit', resolve);
      proc.kill();
      running.delete(proc);
    });
  return { dir, base, api, stop };
}

after(() => {
  for (const proc of running) proc.kill();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// A finished session with a hand, and a goal: data of your own.
async function logSomething(server, venue = 'Casino') {
  const live = (await server.api('/sessions', 'POST', { game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue, buyIn: 200 })).data;
  await server.api('/hands', 'POST', { sessionId: live.id, title: `Hand at ${venue}`, game: 'NLH', stakes: '$1/$2', heroPosition: 'BTN', holeCards: ['As', 'Kd'], board: [], potSize: 50, result: 25, verdict: 'good', tags: [], note: '', streets: [], players: [] });
  await server.api(`/sessions/${live.id}/finish`, 'POST', { cashOut: 260, notes: venue });
  await server.api('/goals', 'POST', { title: `Goal at ${venue}`, metric: 'sessions_played', target: 5, startDate: '2026-10-01', deadline: '2026-12-31' });
  return live.id;
}

test('your data survives a restart, and each start saves an automatic backup of it', async () => {
  const first = await startServer();
  // A fresh install has only the sample data: nothing of yours, so no backup yet.
  assert.deepEqual((await first.api('/data/status')).data.userData, { sessions: 0, hands: 0, goals: 0 });
  assert.equal((await first.api('/data/snapshots')).data.length, 0);
  const id = await logSomething(first);
  await first.stop();

  // The "update": the same database, a new server.
  const second = await startServer(first.dir);
  const sessions = (await second.api('/sessions')).data;
  assert.ok(sessions.some((s) => s.id === id), 'the session is still there');
  const status = (await second.api('/data/status')).data;
  assert.deepEqual(status.userData, { sessions: 1, hands: 1, goals: 1 });
  const snapshots = (await second.api('/data/snapshots')).data;
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].reason, 'startup');

  // It downloads as a regular backup file with that session in it.
  const file = await fetch(`${second.base}/data/snapshots/${snapshots[0].name}`);
  assert.match(file.headers.get('content-disposition'), /^attachment/);
  assert.ok((await file.json()).sessions.some((s) => s.id === id));

  // Nothing changed since: saving again adds nothing.
  assert.equal((await second.api('/data/snapshots', 'POST')).data, null);
  assert.equal((await second.api('/data/snapshots/../../etc')).status, 404);
  await second.stop();
});

test('a backup can go on top of your data or replace it, and an automatic backup puts it back', async () => {
  const mine = await startServer();
  const other = await startServer();
  const myId = await logSomething(mine, 'Home game');
  const otherId = await logSomething(other, 'Casino');
  const backup = await (await fetch(`${other.base}/data/backup`)).json();

  // On top: both records.
  const preview = (await mine.api('/data/import?dryRun=1', 'POST', { backup, mode: 'add' })).data;
  assert.deepEqual(preview.sessions, { added: 1, skipped: 0 });
  assert.equal(preview.replaced, null);

  // Instead: the preview says what goes, nothing changes until it's confirmed.
  const replacePreview = (await mine.api('/data/import?dryRun=1', 'POST', { backup, mode: 'replace' })).data;
  assert.ok(replacePreview.replaced.sessions >= 1, 'the sessions here would be deleted');
  assert.ok((await mine.api('/sessions')).data.some((s) => s.id === myId), 'a preview changes nothing');

  const replaced = (await mine.api('/data/import', 'POST', { backup, mode: 'replace' })).data;
  assert.equal(replaced.snapshot.reason, 'before-replace', 'an automatic backup of what was here comes first');
  const now = (await mine.api('/sessions')).data;
  assert.deepEqual(now.map((s) => s.id), [otherId], 'exactly the backup, no samples');
  assert.deepEqual((await mine.api('/hands')).data.map((h) => h.title), ['Hand at Casino']);

  // Changed your mind: put the automatic backup back.
  const restored = await mine.api(`/data/snapshots/${replaced.snapshot.name}/restore`, 'POST');
  assert.equal(restored.status, 200);
  assert.equal(restored.data.snapshot.reason, 'before-restore');
  const back = (await mine.api('/sessions')).data;
  assert.ok(back.some((s) => s.id === myId), 'your session is back');
  assert.ok(!back.some((s) => s.id === otherId), "the other record isn't");

  // Replacing everything with an empty backup is refused.
  const empty = await mine.api('/data/import', 'POST', { backup: { ...backup, sessions: [], hands: [], goals: [] }, mode: 'replace' });
  assert.equal(empty.status, 400);
  assert.match(empty.data.error, /empty/);
  assert.equal((await mine.api('/data/import', 'POST', { backup, mode: 'wipe' })).status, 400);
  await mine.stop();
  await other.stop();
});
