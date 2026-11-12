// Dialog rendered over the page: a bottom sheet on phones, a centered card on larger screens.
// Closes on backdrop click or Escape, and stops the page behind it from scrolling. Closing plays the opening
// animation in reverse (the sheet slides back down) before the dialog leaves the page.
// On phones the sheet can be dragged down by its handle to close it. It never goes full screen: a sheet is the
// short version, and what needs the whole screen (a chart, a grid) has its own full-screen view.
// `onBack` adds a back arrow (a sheet that was drilled into from another).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogLayer } from '../../hooks/useDialogLayer.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useSheetDrag } from '../../hooks/useSheetDrag.js';
import Icon from '../Icon/Icon.jsx';
import './Modal.css';

// How long the closing animation runs (Modal.css): the sheet slides away, then the backdrop finishes fading.
export const MODAL_CLOSE_MS = 300;

export default function Modal({ open, onClose, title, children, className = '', onBack }) {
  const dialogRef = useRef(null);
  const phone = useMediaQuery('(max-width: 639px)');
  // Still on the page while it animates away after closing.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;

  const drag = useSheetDrag({ enabled: phone && !closing, onDismiss: onClose });
  // A sheet opening again starts at rest, not where it was dragged away.
  const resetRef = useRef(drag.reset);
  resetRef.current = drag.reset;
  useEffect(() => {
    if (open) resetRef.current();
  }, [open]);

  // While open: Escape closes (the top dialog only), the page stops scrolling, focus moves in.
  useDialogLayer(open, onClose, dialogRef);

  // Closing: leave the page once the reverse animation has played (at once if motion is reduced).
  useEffect(() => {
    if (!closing) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setShown(false), reduced ? 0 : MODAL_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!shown) return null;

  // While closing, taps go through to the page underneath.
  return createPortal(
    <div
      className={`modal-backdrop ${closing ? 'is-closing' : ''}`}
      onMouseDown={(event) => !closing && event.target === event.currentTarget && onClose()}
    >
      <div
        className={`modal ${className} ${drag.dragging ? 'is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={closing || undefined}
        tabIndex={-1}
        ref={dialogRef}
        style={drag.style}
      >
        {/* The handle: the grabber and the title bar. Dragging it moves the sheet. */}
        <div className="modal-handle" {...drag.handlers}>
          <span className="modal-grabber" aria-hidden="true" />
          <div className="modal-header">
            {onBack && (
              <button type="button" className="modal-close" onClick={onBack} aria-label="Back">
                <Icon name="chevronLeft" size={18} />
              </button>
            )}
            <h2 className="modal-title">{title}</h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
