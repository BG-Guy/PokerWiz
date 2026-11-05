// A view that takes the whole screen: charts and other big pictures that need every pixel (a range grid, a
// curve). A bar on top with a back button, the title and optional actions; the content fills the rest and
// scrolls if it has to. Rises in from the bottom and goes back down on close. Escape or the back button closes
// it, and a sheet (Modal) can open over it.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogLayer } from '../../hooks/useDialogLayer.js';
import Icon from '../Icon/Icon.jsx';
import './FullscreenView.css';

const CLOSE_MS = 240; // matches the closing animation in FullscreenView.css

export default function FullscreenView({ open, onClose, title, subtitle, actions, className = '', children }) {
  // Stays on the page while it animates away after closing (the same pattern as Modal).
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;
  const viewRef = useRef(null);
  useDialogLayer(open, onClose, viewRef);

  useEffect(() => {
    if (!closing) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setShown(false), reduced ? 0 : CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!shown) return null;
  return createPortal(
    <div className={`fullscreen-view ${closing ? 'is-closing' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={closing || undefined} tabIndex={-1} ref={viewRef}>
      <header className="fullscreen-view-bar">
        <button type="button" className="fullscreen-view-back" onClick={onClose} aria-label="Back">
          <Icon name="chevronLeft" size={22} />
        </button>
        <div className="fullscreen-view-heading">
          <h2 className="fullscreen-view-title">{title}</h2>
          {subtitle && <p className="fullscreen-view-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="fullscreen-view-actions">{actions}</div>}
      </header>
      <div className="fullscreen-view-body">{children}</div>
    </div>,
    document.body
  );
}
