// Dialog rendered over the page: a bottom sheet on phones, a centered card on larger screens.
// Closes on backdrop click or Escape, and stops the page behind it from scrolling. Closing plays the opening
// animation in reverse (the sheet slides back down) before the dialog leaves the page.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon/Icon.jsx';
import './Modal.css';

// How long the closing animation runs (Modal.css): the sheet slides away, then the backdrop finishes fading.
export const MODAL_CLOSE_MS = 300;

// Open dialogs, newest last. A dialog can open over another (a confirm over an edit sheet): Escape closes
// only the one on top.
const openDialogs = [];

export default function Modal({ open, onClose, title, children, className = '' }) {
  const dialogRef = useRef(null);
  // Keep the latest onClose in a ref so re-renders of the parent don't re-run the open effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Still on the page while it animates away after closing.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;

  // While open: listen for Escape, lock page scroll, and move focus into the dialog once.
  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    openDialogs.push(token);
    const onKey = (event) => event.key === 'Escape' && openDialogs.at(-1) === token && onCloseRef.current();
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      openDialogs.splice(openDialogs.indexOf(token), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={closing || undefined}
        tabIndex={-1}
        ref={dialogRef}
      >
        <span className="modal-grabber" aria-hidden="true" />
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
