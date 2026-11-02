// Animated open/close for a section (accordions such as a session in History): it grows from nothing to its full
// height while its content fades and slides in, and shrinks back the same way when it closes. The content is only
// on the page while open (or closing).
import { useEffect, useState } from 'react';
import './Collapse.css';

const CLOSE_MS = 320;

export default function Collapse({ open, id, className = '', children }) {
  const [rendered, setRendered] = useState(open);
  const [expanded, setExpanded] = useState(open);

  // Opening: put the content on the page closed, then expand on the next frame so the height animates.
  // Closing: collapse first, take the content away once the animation has played.
  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setRendered(false), reduced ? 0 : CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!rendered) return null;
  return (
    <div id={id} className={`collapse ${expanded ? 'is-open' : ''} ${className}`}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}
