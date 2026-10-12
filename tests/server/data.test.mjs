// Import and export through the API: a full backup round trip between two installs, checks on the file, the
// spreadsheets, and a live session in a backup. Starts two real servers on throwaway databases (both seeded
// with the sample data, like a fresh install).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const servers = [];

// A server on its own port and database, with a JSON helper.
async function startServer(name) {
  const port = 3800 + servers.length * 50 + Math.floor(Math.random() * 50);
  const dir = mkdtempSync(join(tmpdir(), `pokerwiz-data-${name}-`));
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), POKERWIZ_DB: join(dir, 'test.db') },
    stdio: 'ignore',
  });
  const base = `http://localhost:${port}/api`;
  servers.push({ proc, dir });
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
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data };
  };
  return { base, api };
}

let A;
let B;
before(async () => {
  [A, B] = await Promise.all([startServer('a'), startServer('b')]);
});
after(() => {
  for (const { proc, dir } of servers) {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

// A session played on A: started live, a note, a rebuy and a hand on its timeline, then finished.
async function playSessionOn(server) {
  const live = (await server.api('/sessions', 'POST', { game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', buyIn: 200 })).data;
  await server.api(`/sessions/${live.id}/events`, 'POST', { type: 'note', text: '=SUM(A1) loose table, "fun"' });
  await server.api(`/sessions/${live.id}/events`, 'POST', { type: 'rebuy', amount: 100 });
  const hand = (await server.api('/hands', 'POST', { sessionId: live.id, title: 'Aces cracked', game: 'NLH', stakes: '$1/$2', heroPosition: 'BTN', holeCards: ['As', 'Ad'], board: ['Kc', '7d', '2h', '9s', '3c'], potSize: 400, result: -200, verdict: 'cooler', tags: ['big pot', 'cooler'], note: 'Nothing to do', streets: [], players: [] })).data;
  const finished = (await server.api(`/sessions/${live.id}/finish`, 'POST', { cashOut: 420, rating: 3.5, tilt: 2, notes: 'Good session' })).data;
  return { session: finished, hand };
}

test('a backup holds everything and restores it on another install', async () => {
  const { session, hand } = await playSessionOn(A);
  const goal = (await A.api('/goals', 'POST', { title: 'Play 10 sessions', metric: 'sessions_played', target: 10, startDate: '2026-10-01', deadline: '2026-12-31' })).data;

  // The download: a file, with every session (and its timeline), hand and goal.
  const response = await fetch(`${A.base}/data/backup`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="pokerwiz-backup-\d{4}-\d{2}-\d{2}\.json"$/);
  const backup = await response.json();
  assert.equal(backup.app, 'PokerWiz');
  assert.equal(backup.version, 1);
  assert.equal(backup.sessions.length, (await A.api('/sessions')).data.length);
  assert.equal(backup.hands.length, (await A.api('/hands')).data.length);
  assert.equal(backup.goals.length, (await A.api('/goals')).data.length);
  const saved = backup.sessions.find((s) => s.id === session.id);
  assert.deepEqual(saved.events.map((e) => e.type), ['note', 'rebuy', 'hand']);

  // Preview on B: what would be added and skipped, and nothing changes yet.
  const sessionsBefore = (await B.api('/sessions')).data.length;
  const preview = (await B.api('/data/import?dryRun=1', 'POST', { backup, removeSamples: true })).data;
  assert.deepEqual(preview.sessions, { added: 1, skipped: 0 });
  assert.deepEqual(preview.hands, { added: 1, skipped: 0 });
  assert.deepEqual(preview.goals, { added: 1, skipped: 4 });
  assert.ok(preview.removedSamples.sessions > 0);
  assert.equal((await B.api('/sessions')).data.length, sessionsBefore, 'a preview changes nothing');

  // The import itself: the sample data goes, A's record arrives as it was.
  const imported = await B.api('/data/import', 'POST', { backup, removeSamples: true });
  assert.equal(imported.status, 200);
  const sessions = (await B.api('/sessions')).data;
  assert.deepEqual(sessions.map((s) => s.id), [session.id]);
  for (const key of ['date', 'stakes', 'venue', 'buyIn', 'cashOut', 'rating', 'tilt', 'notes', 'durationMin', 'hands']) assert.deepEqual(sessions[0][key], session[key], key);
  const hands = (await B.api('/hands')).data;
  assert.equal(hands.length, 1);
  assert.equal(hands[0].id, hand.id);
  assert.equal(hands[0].sessionId, session.id);
  assert.deepEqual(hands[0].tags, ['big pot', 'cooler']);
  const goals = (await B.api('/goals')).data;
  assert.ok(goals.some((g) => g.id === goal.id && g.title === 'Play 10 sessions'));

  // Importing the same file again adds nothing (and A's sample data never comes along).
  const again = (await B.api('/data/import', 'POST', { backup })).data;
  assert.deepEqual([again.sessions.added, again.hands.added, again.goals.added], [0, 0, 0]);
});

test('the file is checked before anything is saved', async () => {
  const good = (await (await fetch(`${A.base}/data/backup`)).json());
  const reject = async (backup, pattern) => {
    const { status, data } = await B.api('/data/import', 'POST', { backup });
    assert.equal(status, 400);
    assert.match(data.error, pattern);
  };
  await reject({ app: 'Other', version: 1, sessions: [], hands: [], goals: [] }, /isn't a PokerWiz backup/);
  await reject({ ...good, version: 99 }, /newer version/);
  await reject({ ...good, sessions: [{ ...good.sessions[0], date: '27/09/2026' }] }, /^Session 1 in the file: the date/);
  await reject({ ...good, hands: [good.hands[0], good.hands[0]] }, /same hand twice/);
  await reject({ ...good, goals: [{ ...good.goals[0], data: { ...good.goals[0].data, metric: 'vpip' } }] }, /^Goal 1 in the file/);
});

test('spreadsheets of sessions and hands', async () => {
  const sessionsCsv = await fetch(`${A.base}/data/sessions.csv`);
  assert.match(sessionsCsv.headers.get('content-type'), /^text\/csv/);
  assert.match(sessionsCsv.headers.get('content-disposition'), /pokerwiz-sessions-\d{4}-\d{2}-\d{2}\.csv/);
  const bytes = new Uint8Array(await sessionsCsv.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'a UTF-8 byte-order mark for Excel');
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.startsWith('Date,Type,Game,Stakes,Venue,Hours'), 'the header row');
  const rows = text.trim().split('\r\n');
  assert.equal(rows.length - 1, (await A.api('/sessions')).data.length);

  // Text that would run as a formula is defused, and quotes and commas are escaped.
  const { session } = await playSessionOn(A);
  await A.api(`/sessions/${session.id}`, 'PATCH', { notes: '=HYPERLINK("x"), then fold' });
  const after = await (await fetch(`${A.base}/data/sessions.csv`)).text();
  assert.ok(after.includes(`"'=HYPERLINK(""x""), then fold"`));

  const handsCsv = await (await fetch(`${A.base}/data/hands.csv`)).text();
  const handRows = handsCsv.trim().split('\r\n');
  assert.equal(handRows.length - 1, (await A.api('/hands')).data.length);
  assert.ok(handsCsv.includes('As Ad,Kc 7d 2h 9s 3c,-200,-100,400,Cooler'), 'cards, result in $ and bb, pot, verdict');
  assert.ok(handsCsv.includes('big pot; cooler'));
});

test('a live session in a backup waits if one is already running', async () => {
  await A.api('/sessions', 'POST', { game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', buyIn: 200 });
  const backup = await (await fetch(`${A.base}/data/backup`)).json();
  assert.ok(backup.sessions.some((s) => s.status === 'live'));
  await B.api('/sessions', 'POST', { game: 'NLH', stakes: '$2/$5', bigBlind: 5, venue: 'Online', buyIn: 500 });
  const result = (await B.api('/data/import', 'POST', { backup })).data;
  assert.equal(result.liveSkipped, true);
  assert.equal((await B.api('/sessions/live')).data.stakes, '$2/$5', 'the running session is untouched');
});
