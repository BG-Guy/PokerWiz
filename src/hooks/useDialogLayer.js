// What everything that opens over the page shares (Modal, FullscreenView): while it's open Escape closes the
// top-most one only, the page behind stops scrolling, and focus moves into it once.
import { useEffect, useRef } from 'react';

// Open layers, newest last. One can open over another (a sheet over a full-screen chart): Escape closes only the
// one on top.
const layers = [];

// ref: the layer's element (it takes focus when it opens).
export function useDialogLayer(open, onClose, ref) {
  // The latest onClose, so a parent re-rendering doesn't re-run the effect below.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    layers.push(token);
    const onKey = (event) => event.key === 'Escape' && !event.defaultPrevented && layers.at(-1) === token && onCloseRef.current();
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref?.current?.focus({ preventScroll: true });
    return () => {
      layers.splice(layers.indexOf(token), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, ref]);
}
