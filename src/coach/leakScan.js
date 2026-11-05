// The background scan behind the leak report: grades the saved hands that have no leak record yet, one at a time
// in a web worker (the coach's), and saves each result on its hand (hand.coachDecisions, see leaks.js).
// A hand with decisions after the flop gets a quick preflop look first and the whole hand later, so the report
// fills in at once and then gets deeper. Pause and stop work between hands.
import { prepareSavedHand } from './savedHand.js';
import { packDecisions, scanStage, skippedMarker } from './leaks.js';
import { updateHand } from '../api/hands.js';
import { getMoneyUnit } from '../utils/format.js';

const HAND_TIMEOUT_MS = 90_000; // a hand that takes longer than this is skipped

// hands: the saved hands as loaded. onSaved(hand): a hand was analyzed and saved (the server's copy).
// onProgress({ running, phase: 'first' | 'deepen', done, total, title, error }): where the scan is.
// Returns { stop, pause, resume }.
export function startLeakScan(hands, { onSaved, onProgress }) {
  let stopped = false;
  let paused = false;
  let wake = null;
  let worker = null;
  let requestId = 0;

  // One analysis in the worker, with a time limit (a stuck worker is thrown away and replaced).
  function analyze(record, { preflopOnly }) {
    worker ??= new Worker(new URL('./coach.worker.js', import.meta.url), { type: 'module' });
    const mine = worker;
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const fail = (message) => {
        clearTimeout(timer);
        mine.terminate();
        if (worker === mine) worker = null;
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail('This hand took too long to analyze'), HAND_TIMEOUT_MS);
      mine.onmessage = (event) => {
        if (event.data.id !== id || event.data.progress) return;
        clearTimeout(timer);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.report);
      };
      mine.onerror = (event) => fail(event.message || 'The analysis stopped');
      mine.postMessage({ id, record, unit: getMoneyUnit(), detail: 'fast', preflopOnly });
    });
  }

  // One hand: analyze it (or note why it can't be) and save the result on the hand.
  async function handle({ hand, stage }) {
    const prepared = prepareSavedHand(hand);
    // The leak report always compares you with GTO: reads you set on a hand's players aren't used here.
    if (prepared.record) prepared.record = { ...prepared.record, players: prepared.record.players.map((p) => ({ ...p, profile: null })) };
    let packed;
    if (prepared.error) {
      packed = skippedMarker(prepared.error);
    } else {
      try {
        const report = await analyze(prepared.record, { preflopOnly: stage === 'preflop' });
        packed = packDecisions(report, stage === 'preflop' ? 'preflop' : 'fast');
      } catch (error) {
        packed = skippedMarker(error.message);
      }
    }
    const saved = await updateHand(hand.id, { coachDecisions: packed });
    onSaved(saved);
    return saved;
  }

  // Wait while paused; true when the scan was stopped meanwhile.
  async function waitIfPaused() {
    while (paused && !stopped) await new Promise((resolve) => (wake = resolve));
    return stopped;
  }

  // Works through a list of tasks, reporting each one; returns the saved hands.
  async function work(tasks, phase) {
    const saved = [];
    onProgress({ running: true, phase, done: 0, total: tasks.length, title: null, error: null });
    for (const [index, task] of tasks.entries()) {
      if (await waitIfPaused()) return saved;
      onProgress({ running: true, phase, done: index, total: tasks.length, title: task.hand.title });
      saved.push(await handle(task));
      onProgress({ running: true, phase, done: index + 1, total: tasks.length, title: null });
    }
    return saved;
  }

  (async () => {
    try {
      const first = hands.map((hand) => ({ hand, stage: scanStage(hand) })).filter((task) => task.stage);
      const saved = await work(first, 'first');
      // The hands that only got a preflop look, the biggest pots first.
      const deepen = saved
        .filter((hand) => scanStage(hand))
        .sort((a, b) => (b.potSize ?? 0) - (a.potSize ?? 0))
        .map((hand) => ({ hand, stage: scanStage(hand) }));
      if (!stopped && deepen.length) await work(deepen, 'deepen');
      if (!stopped) onProgress({ running: false, title: null });
    } catch (error) {
      if (!stopped) onProgress({ running: false, title: null, error: error.message });
    } finally {
      worker?.terminate();
      worker = null;
    }
  })();

  return {
    stop() {
      stopped = true;
      wake?.();
      worker?.terminate();
      worker = null;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      wake?.();
    },
  };
}
