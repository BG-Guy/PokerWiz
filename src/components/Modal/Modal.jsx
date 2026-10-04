// Dialog rendered over the page: a bottom sheet on phones, a centered card on larger screens.
// Closes on backdrop click or Escape, and stops the page behind it from scrolling.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon/Icon.jsx';
import './Modal.css';

// Open dialogs, newest last. A dialog can open over another (a confirm over an edit sheet): Escape closes
// only the one on top.
const openDialogs = [];

export default function Modal({ open, onClose, title, children, className = '' }) {
  const dialogRef = useRef(null);
  // Keep the latest onClose in a ref so re-renders of the parent don't re-run the open effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
