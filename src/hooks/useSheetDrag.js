// Drag a bottom sheet by its handle (the grabber and the title bar): pull down to dismiss it, up to open it to
// full screen, and from full screen down to bring it back. A short pull springs back. Returns the inline style
// for the sheet and the pointer handlers for the handle; wire them in Modal.
import { useRef, useState } from 'react';

const DISMISS_PX = 110; // pulled this far down: it closes
const FLING = 0.6; // px per ms: a quick flick closes it from a shorter pull
const EXPAND_PX = 50; // pulled this far up: full screen
const COLLAPSE_PX = 70; // from full screen, pulled this far down: back to a sheet

const INTERACTIVE = 'button, a, input, select, textarea, label';

// enabled: only on phones, where the dialog is a sheet. expanded/canExpand: the full-screen state.
export function useSheetDrag({ enabled, expanded = false, canExpand = false, onDismiss, onExpand, onCollapse }) {
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState('idle'); // idle | dragging | settling | dismissed
  const start = useRef(null);

  const settle = () => {
    setMode('settling');
    setOffset(0);
    setTimeout(() => setMode((m) => (m === 'settling' ? 'idle' : m)), 240);
  };

  const onPointerDown = (event) => {
    if (!enabled || event.button > 0 || event.target.closest(INTERACTIVE)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start.current = { y: event.clientY, t: performance.now() };
    setMode('dragging');
  };

  const onPointerMove = (event) => {
    if (!start.current) return;
    const dy = event.clientY - start.current.y;
    // Pulling up is resisted: there's a little give when it can open to full screen, almost none otherwise.
    setOffset(dy >= 0 ? dy : Math.max(dy, -80) * (canExpand && !expanded ? 0.5 : 0.12));
  };

  const finish = (event, cancelled = false) => {
    if (!start.current) return;
    const dy = event.clientY - start.current.y;
    const velocity = dy / Math.max(performance.now() - start.current.t, 1);
    start.current = null;
    if (cancelled) return settle();
    if (dy < -EXPAND_PX && canExpand && !expanded) {
      onExpand?.();
      return settle();
    }
    if (dy > 0 && expanded && dy > COLLAPSE_PX && velocity < 1.2) {
      onCollapse?.();
      return settle();
    }
    if (dy > DISMISS_PX || (velocity > FLING && dy > 30)) {
      // Stay where the finger left it: the closing animation carries on from there.
      setMode('dismissed');
      return onDismiss?.();
    }
    return settle();
  };

  return {
    style:
      mode === 'idle' && offset === 0
        ? undefined
        : { transform: `translateY(${offset}px)`, transition: mode === 'settling' ? 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none' },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: (event) => finish(event, true),
    },
    dragging: mode === 'dragging',
    // Back to rest (a sheet opening again).
    reset: () => {
      start.current = null;
      setOffset(0);
      setMode('idle');
    },
  };
}
