// Editing and deleting through the API: hands, sessions (finished and live, with their timeline) and goals.
// Starts the real server on a throwaway database seeded with the sample data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3400 + Math.floor(Math.random() * 400);
const base = `http://localhost:${PORT}/api`;
let server;
let dir;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pokerwiz-edit-'));
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), POKERWIZ_DB: join(dir, 'test.db') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

const api = async (path, method = 'GET', body) => {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
};

test('hands: edit the hand itself, reject bad edits, delete', async () => {
  const [hand] = (await api('/hands')).data;
  const edited = await api(`/hands/${hand.id}`, 'PATCH', { title: 'Renamed', date: '2026-09-01', holeCards: ['As', 'Ad'], board: ['Kc', '7d', '2h'], result: 42, potSize: 90, tags: ['test'] });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.title, 'Renamed');
  assert.equal(edited.data.date, '2026-09-01');
  assert.deepEqual(edited.data.holeCards, ['As', 'Ad']);
  assert.equal(edited.data.result, 42);
  assert.equal((await api(`/hands/${hand.id}`, 'PATCH', { holeCards: ['As'] })).status, 400);
  assert.equal((await api(`/hands/${hand.id}`, 'PATCH', { holeCards: ['As', 'Kd'], board: ['As', '2c', '3d'] })).status, 400);
  assert.equal((await api(`/hands/${hand.id}`, 'PATCH', { title: '  ' })).status, 400);
  assert.equal((await api(`/hands/${hand.id}`, 'DELETE')).status, 204);
  assert.equal((await api(`/hands/${hand.id}`)).status, 404);
  assert.equal((await api(`/hands/${hand.id}`, 'DELETE')).status, 404);
});

test('finished sessions: edit and delete (their hands stay)', async () => {
  const [session] = (await api('/sessions')).data;
  const edited = await api(`/sessions/${session.id}`, 'PATCH', { venue: 'Home game', cashOut: 500, durationMin: 240, hands: 120, notes: 'edited', rating: 4.5, tilt: 2 });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.venue, 'Home game');
  assert.equal(edited.data.cashOut, 500);
  assert.equal(edited.data.rating, 4.5);
  assert.equal((await api(`/sessions/${session.id}`, 'PATCH', { cashOut: -5 })).status, 400);
  assert.equal((await api(`/sessions/${session.id}`, 'PATCH', { tilt: 9 })).status, 400);
  const handsBefore = (await api('/hands')).data.length;
  assert.equal((await api(`/sessions/${session.id}`, 'DELETE')).status, 204);
  assert.ok(!(await api('/sessions')).data.some((s) => s.id === session.id));
  assert.equal((await api('/hands')).data.length, handsBefore);
});

test('live sessions: edit the setup and timeline entries; rebuys keep the buy-in right', async () => {
  const live = (await api('/sessions', 'POST', { game: 'NLH', stakes: '$1/$2', bigBlind: 2, venue: 'Casino', buyIn: 200 })).data;
  let session = (await api(`/sessions/${live.id}/events`, 'POST', { type: 'rebuy', amount: 100 })).data;
  session = (await api(`/sessions/${live.id}/events`, 'POST', { type: 'note', text: 'tight table' })).data;
  assert.equal(session.buyIn, 300);
  const [rebuy, note] = session.events;
  session = (await api(`/sessions/${live.id}/events/${rebuy.id}`, 'PATCH', { amount: 150 })).data;
  assert.equal(session.buyIn, 350);
  session = (await api(`/sessions/${live.id}/events/${note.id}`, 'PATCH', { text: 'loose table' })).data;
  assert.equal(session.events.find((e) => e.id === note.id).text, 'loose table');
  session = (await api(`/sessions/${live.id}`, 'PATCH', { venue: 'Online', startBuyIn: 250 })).data;
  assert.equal(session.venue, 'Online');
  assert.equal(session.buyIn, 400);
  session = (await api(`/sessions/${live.id}/events/${rebuy.id}`, 'DELETE')).data;
  assert.equal(session.buyIn, 250);
  assert.equal(session.events.length, 1);
  assert.equal((await api(`/sessions/${live.id}/events/nope`, 'DELETE')).status, 404);
  assert.equal((await api(`/sessions/${live.id}`, 'DELETE')).status, 204);
});

test('goals: add, edit, remove', async () => {
  const created = await api('/goals', 'POST', { title: 'Play 40 sessions', metric: 'sessions_played', target: 40, startDate: '2026-10-01', deadline: '2026-12-31' });
  assert.equal(created.status, 201);
  assert.equal(created.data.unit, 'sessions');
  assert.equal(created.data.category, 'Volume');
  const edited = await api(`/goals/${created.data.id}`, 'PATCH', { target: 50, metric: 'net_profit' });
  assert.equal(edited.data.target, 50);
  assert.equal(edited.data.unit, '$');
  assert.equal((await api('/goals', 'POST', { title: 'x', metric: 'nope', target: 1, startDate: '2026-10-01', deadline: '2026-12-31' })).status, 400);
  assert.equal((await api('/goals', 'POST', { title: 'x', metric: 'hands_played', target: 1, startDate: '2026-10-01', deadline: '2026-09-01' })).status, 400);
  assert.equal((await api(`/goals/${created.data.id}`, 'DELETE')).status, 204);
  assert.ok(!(await api('/goals')).data.some((g) => g.id === created.data.id));
});
