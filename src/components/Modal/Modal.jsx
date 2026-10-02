// Dialog rendered over the page: a bottom sheet on phones, a centered card on larger screens.
// Closes on backdrop click or Escape, and stops the page behind it from scrolling.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon/Icon.jsx';
import './Modal.css';

export default function Modal({ open, onClose, title, children, className = '' }) {
  const dialogRef = useRef(null);
  // Keep the latest onClose in a ref so re-renders of the parent don't re-run the open effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // While open: listen for Escape, lock page scroll, and move focus into the dialog once.
  useEffect(() => {
    if (!open) return undefined;
    // Escape closes only the top dialog (e.g. the card picker over the Edit hand sheet).
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      const open = document.querySelectorAll('.modal-backdrop');
      if (open[open.length - 1] === dialogRef.current?.parentElement) onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={dialogRef}>
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
