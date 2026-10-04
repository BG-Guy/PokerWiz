// Keeps a sheet on the page while it animates closed (Modal plays its opening backwards when it closes).
// For sheets that are only rendered while open: pass what the sheet is showing (true, a goal, 'setup'...) or
// null/false when it's closed. Returns [value, open]: render the sheet while value is set, with open={open};
// after closing, value holds the last one until the closing animation has played.
import { useEffect, useState } from 'react';
import { MODAL_CLOSE_MS } from '../components/Modal/Modal.jsx';

export function useClosingValue(current) {
  const [last, setLast] = useState(current || null);
  if (current && current !== last) setLast(current);

  // Once closed, let go of the last value after the animation (at once if motion is reduced).
  useEffect(() => {
    if (current) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setLast(null), reduced ? 0 : MODAL_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [current]);

  return [current || last, Boolean(current)];
}
