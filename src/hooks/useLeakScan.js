// Runs the leak scan (coach/leakScan.js) while a page is open: once the hands have loaded it analyzes the ones
// that still need it and calls onSaved with each result. Returns where the scan is, plus pause and resume. It
// also rests while the page is hidden (another app in front, the screen off) and carries on when you're back,
// unless you paused it yourself.
import { useCallback, useEffect, useRef, useState } from 'react';
import { startLeakScan } from '../coach/leakScan.js';

const IDLE = { running: false, paused: false, phase: 'first', done: 0, total: 0, title: null, error: null };

// hands: the loaded hands (null until they have). onSaved(hand): replace that hand in the page's list.
export function useLeakScan(hands, onSaved) {
  const [state, setState] = useState(IDLE);
  const scan = useRef(null);
  const userPaused = useRef(false);
  // The latest of both, so the scan (started once) never works from stale ones.
  const latest = useRef({ hands, onSaved });
  latest.current = { hands, onSaved };
  const ready = hands != null;

  useEffect(() => {
    if (!ready) return undefined;
    const started = startLeakScan(latest.current.hands, {
      onSaved: (hand) => latest.current.onSaved(hand),
      onProgress: (progress) => setState((previous) => ({ ...previous, ...progress })),
    });
    scan.current = started;
    return () => {
      started.stop();
      setState(IDLE);
    };
  }, [ready]);

  // Rest while the page is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) scan.current?.pause();
      else if (!userPaused.current) scan.current?.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const pause = useCallback(() => {
    userPaused.current = true;
    scan.current?.pause();
    setState((previous) => ({ ...previous, paused: true }));
  }, []);
  const resume = useCallback(() => {
    userPaused.current = false;
    scan.current?.resume();
    setState((previous) => ({ ...previous, paused: false }));
  }, []);

  return { ...state, pause, resume };
}
