// Larger screens: a card grows into a big detail panel and shrinks back into the card on close (FLIP with the
// Web Animations API: the panel starts at the card's exact spot and size, then animates to its own). The card
// hides while its panel is out, so it reads as one object. Escape, the backdrop or the close button close it;
// with reduced motion it simply appears and disappears.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon/Icon.jsx';
import './ExpandPanel.css';

const OPEN_MS = 380;
const CLOSE_MS = 260;
const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The transform that puts the panel exactly over the card.
function fromCard(card, panel) {
  const a = card.getBoundingClientRect();
  const b = panel.getBoundingClientRect();
  return `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
}

export default function ExpandPanel({ open, onClose, title, originRef, children }) {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;
  const panelRef = useRef(null);
  const backdropRef = useRef(null);
  const contentRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Opening: grow from the card, fade the content in once the panel has mostly taken shape.
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const card = originRef?.current;
    if (card) card.style.visibility = 'hidden';
    panelRef.current.focus({ preventScroll: true });
    if (reducedMotion() || !card) return;
    panelRef.current.animate([{ transform: fromCard(card, panelRef.current), borderRadius: '18px' }, { transform: 'none' }], { duration: OPEN_MS, easing: EASE });
    contentRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: OPEN_MS * 0.45, easing: 'ease', fill: 'backwards' });
    backdropRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS * 0.7, easing: 'ease' });
  }, [open, originRef]);

  // Closing: content fades first, then the panel shrinks back into the card, which reappears.
  useEffect(() => {
    if (!closing) return undefined;
    const card = originRef?.current;
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      if (card) {
        card.style.visibility = '';
        card.focus({ preventScroll: true });
      }
      setShown(false);
    };
    if (reducedMotion() || !card || !panelRef.current) {
      finish();
      return undefined;
    }
    contentRef.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
    backdropRef.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, fill: 'forwards' });
    const shrink = panelRef.current.animate([{ transform: 'none' }, { transform: fromCard(card, panelRef.current), borderRadius: '18px' }], {
      duration: CLOSE_MS,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    });
    shrink.finished.then(finish, finish);
    return () => {
      cancelled = true;
      if (card) card.style.visibility = '';
    };
  }, [closing, originRef]);

  // While open: Escape closes, and the page behind stops scrolling.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && onCloseRef.current();
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!shown) return null;

  return createPortal(
    <div className={`expand-panel-layer ${closing ? 'is-closing' : ''}`}>
      <div className="expand-panel-backdrop" ref={backdropRef} onMouseDown={() => !closing && onClose()} />
      <div className="expand-panel" role="dialog" aria-modal="true" aria-label={title} aria-hidden={closing || undefined} tabIndex={-1} ref={panelRef}>
        <div className="expand-panel-content" ref={contentRef}>
          <header className="expand-panel-header">
            <h2 className="expand-panel-title">{title}</h2>
            <button type="button" className="expand-panel-close" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="expand-panel-body">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
