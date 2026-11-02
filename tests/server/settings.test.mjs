// Your profile and preferences (/api/settings), sessions at custom stakes (straddle, table size and name), and
// both of them in backups: exported, imported on another install, and older backups without them still working.
// Real servers on throwaway databases.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freePort } from './freePort.mjs';

const running = new Set();
const dirs = [];

// A server on the database in `dir` (a new throwaway one if not given), with a JSON helper and stop().
async function startServer(dir = mkdtempSync(join(tmpdir(), 'pokerwiz-settings-'))) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const port = await freePort();
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

const CUSTOM = { label: '$2/$5/$10', sb: 2, bb: 5, ante: null, straddle: 10, game: 'NLH', tableSize: 9, tableName: 'Table 12' };

test('settings: defaults, saving, clearing, checks, and they survive a restart', async () => {
  const server = await startServer();
  const fresh = (await server.api('/settings')).data;
  assert.equal(fresh.name, '');
  assert.equal(fresh.buyInDepth, 100);
  assert.deepEqual(fresh.customStakes, []);

  // Saving trims text and replies with every setting.
  const saved = await server.api('/settings', 'PATCH', { name: '  Guy  ', nickname: 'TheWiz', homeCasino: 'Bellagio', playingSince: 2015, favoriteGame: 'PLO', buyInDepth: 200, customStakes: [CUSTOM] });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.name, 'Guy');
  assert.equal(saved.data.homeCasino, 'Bellagio');
  assert.deepEqual(saved.data.customStakes, [CUSTOM]);

  // null puts one back to its default; the others stay.
  const cleared = (await server.api('/settings', 'PATCH', { homeCasino: null })).data;
  assert.equal(cleared.homeCasino, '');
  assert.equal(cleared.nickname, 'TheWiz');

  // Unknown settings and bad values are refused, and nothing is saved.
  assert.equal((await server.api('/settings', 'PATCH', { favoriteColor: 'red' })).status, 400);
  assert.equal((await server.api('/settings', 'PATCH', { name: 'Ok', playingSince: 1800 })).status, 400);
  assert.equal((await server.api('/settings', 'PATCH', { favoriteGame: 'Stud' })).status, 400);
  assert.equal((await server.api('/settings', 'PATCH', { customStakes: [{ ...CUSTOM, bb: 0 }] })).status, 400);
  assert.equal((await server.api('/settings', 'PATCH', { customStakes: [{ ...CUSTOM, tableSize: 14 }] })).status, 400);
  assert.equal((await server.api('/settings', 'PATCH', [1, 2])).status, 400);
  assert.equal((await server.api('/settings')).data.name, 'Guy');

  // A restart (an update) keeps them.
  await server.stop();
  const again = await startServer(server.dir);
  const after = (await again.api('/settings')).data;
  assert.equal(after.name, 'Guy');
  assert.equal(after.playingSince, 2015);
  assert.equal(after.buyInDepth, 200);
  await again.stop();
});

test('a session at custom stakes keeps its blinds, straddle and table, and they can be edited', async () => {
  const server = await startServer();
  const bad = [
    { tableSize: 1 },
    { tableSize: 11 },
    { straddle: -4 },
    { smallBlind: 'two' },
    { tableName: 'x'.repeat(61) },
  ];
  for (const extra of bad) {
    const response = await server.api('/sessions', 'POST', { game: 'NLH', stakes: '$2/$5', bigBlind: 5, venue: 'Casino', buyIn: 500, ...extra });
    assert.equal(response.status, 400, JSON.stringify(extra));
  }

  const live = await server.api('/sessions', 'POST', {
    game: 'NLH', stakes: '$2/$5/$10', bigBlind: 5, smallBlind: 2, ante: 0, straddle: 10, tableSize: 9, tableName: '  Table 12 ', venue: 'Casino', buyIn: 1000,
  });
  assert.equal(live.status, 201);
  assert.equal(live.data.stakes, '$2/$5/$10');
  assert.equal(live.data.smallBlind, 2);
  assert.equal(live.data.straddle, 10);
  assert.equal(live.data.tableSize, 9);
  assert.equal(live.data.tableName, 'Table 12');

  // Back to regular stakes while playing: the straddle and table details can be cleared.
  const edited = (await server.api(`/sessions/${live.data.id}`, 'PATCH', { stakes: '$2/$5', bigBlind: 5, straddle: null, tableName: null })).data;
  assert.equal(edited.straddle, null);
  assert.equal(edited.tableName, null);
  assert.equal(edited.tableSize, 9);
  assert.equal((await server.api(`/sessions/${live.data.id}`, 'PATCH', { tableSize: 0 })).status, 400);

  // A plain start (the stakes buttons) still works without any of it.
  await server.api(`/sessions/${live.data.id}`, 'DELETE');
  const plain = (await server.api('/sessions', 'POST', { game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', buyIn: 200 })).data;
  assert.equal(plain.straddle, null);
  assert.equal(plain.tableSize, null);
  await server.stop();
});

test('backups carry your settings and custom stakes; older backups without them still import', async () => {
  const from = await startServer();
  await from.api('/settings', 'PATCH', { name: 'Guy', homeCasino: 'Bellagio', usualStakes: '$2/$5', customStakes: [CUSTOM] });
  const live = (await from.api('/sessions', 'POST', { game: 'PLO', stakes: '$2/$5/$10', bigBlind: 5, smallBlind: 2, straddle: 10, tableSize: 6, tableName: 'Friday game', venue: 'Home game', buyIn: 500 })).data;
  await from.api(`/sessions/${live.id}/finish`, 'POST', { cashOut: 800 });
  const backup = await (await fetch(`${from.base}/data/backup`)).json();
  assert.deepEqual(backup.settings, { customStakes: [CUSTOM], homeCasino: 'Bellagio', name: 'Guy', usualStakes: '$2/$5' });
  const exported = backup.sessions.find((s) => s.id === live.id);
  assert.equal(exported.straddle, 10);
  assert.equal(exported.tableSize, 6);
  assert.equal(exported.tableName, 'Friday game');

  // Another install that already has a name: the backup fills in what's missing and keeps yours.
  const to = await startServer();
  await to.api('/settings', 'PATCH', { name: 'Guy B' });
  const preview = (await to.api('/data/import?dryRun=1', 'POST', { backup })).data;
  assert.deepEqual(preview.settings, { added: 3, skipped: 1 });
  assert.equal((await to.api('/settings')).data.homeCasino, '', 'a preview saves nothing');
  const result = (await to.api('/data/import', 'POST', { backup })).data;
  assert.deepEqual(result.settings, { added: 3, skipped: 1 });
  const settings = (await to.api('/settings')).data;
  assert.equal(settings.name, 'Guy B');
  assert.equal(settings.homeCasino, 'Bellagio');
  assert.deepEqual(settings.customStakes, [CUSTOM]);
  const session = (await to.api(`/sessions/${live.id}`)).data;
  assert.equal(session.straddle, 10);
  assert.equal(session.tableName, 'Friday game');

  // A backup from before settings and table details: no settings field, no new session fields.
  const old = {
    ...backup,
    settings: undefined,
    sessions: backup.sessions.map(({ straddle, tableSize, tableName, ...rest }) => ({ ...rest, id: `old-${rest.id}`, externalId: null, events: [] })),
    hands: [],
    goals: [],
  };
  delete old.settings;
  const fresh = await startServer();
  const oldResult = await fresh.api('/data/import', 'POST', { backup: old });
  assert.equal(oldResult.status, 200);
  assert.deepEqual(oldResult.data.settings, { added: 0, skipped: 0 });
  assert.equal((await fresh.api(`/sessions/old-${live.id}`)).data.straddle, null);

  // Replacing your data with an old backup keeps your settings; with a new one, its settings take over.
  await fresh.api('/settings', 'PATCH', { name: 'Mine', nickname: 'Nick' });
  await fresh.api('/data/import', 'POST', { backup: old, mode: 'replace' });
  assert.equal((await fresh.api('/settings')).data.name, 'Mine');
  await fresh.api('/data/import', 'POST', { backup, mode: 'replace' });
  const replaced = (await fresh.api('/settings')).data;
  assert.equal(replaced.name, 'Guy');
  assert.equal(replaced.nickname, '', 'settings the backup did not have are cleared too');

  // Bad settings in a file are refused before anything is saved; settings this version doesn't know are ignored.
  const badFile = await fresh.api('/data/import', 'POST', { backup: { ...backup, settings: { playingSince: 'long ago' } } });
  assert.equal(badFile.status, 400);
  assert.match(badFile.data.error, /settings/);
  assert.equal((await fresh.api('/data/import', 'POST', { backup: { ...backup, settings: 'nope' } })).status, 400);
  const newer = await fresh.api('/data/import', 'POST', { backup: { ...backup, settings: { name: 'X', somethingNew: true } } });
  assert.equal(newer.status, 200);
  await Promise.all([from.stop(), to.stop(), fresh.stop()]);
});
