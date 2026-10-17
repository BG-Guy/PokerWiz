// Swipe a row left to reveal its actions behind it, on the right (as in iOS Mail): swipe a little and let go,
// and they stay open (tap one, swipe back, or tap the row to close); swipe all the way across, and the last
// action (Delete) runs at once, its button stretching under your finger. Up-and-down scrolling is left alone, a
// swipe never also opens the row's link, and only one row is open at a time. Works with a mouse drag too.
import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon/Icon.jsx';
import './SwipeRow.css';

const ACTION_WIDTH = 78;
const FULL_SWIPE = 0.6; // share of the row's width that runs the last action
let closeOpenRow = null; // the open row's close(): opening another row closes it

// actions: [{ key, label, icon, tone ('neutral' | 'danger'), onClick, leaves? }]. An action with leaves: true
// (a delete) slides the row out before it runs.
export default function SwipeRow({ actions, className = '', children }) {
  const [offset, setOffset] = useState(0); // how far the row is pulled left (px, 0 or less)
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rowRef = useRef(null);
  const offsetRef = useRef(0);
  const drag = useRef(null); // { x, y, start, axis, width }
  const suppressClick = useRef(false);
  const openWidth = ACTION_WIDTH * actions.length;

  const move = (value) => {
    offsetRef.current = value;
    setOffset(value);
  };
  const closeRef = useRef(() => move(0));
  useEffect(() => () => closeOpenRow === closeRef.current && (closeOpenRow = null), []);

  // Run an action: a delete slides the row out first.
  function run(action) {
    if (closeOpenRow === closeRef.current) closeOpenRow = null;
    if (!action.leaves) {
      move(0);
      action.onClick();
      return;
    }
    setLeaving(true);
    move(-(rowRef.current?.offsetWidth ?? 400));
    setTimeout(action.onClick, 260);
  }

  const onPointerDown = (event) => {
    if (leaving || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag.current = { x: event.clientX, y: event.clientY, start: offsetRef.current, axis: null, width: rowRef.current.offsetWidth };
  };
  const onPointerMove = (event) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'y') return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
      if (closeOpenRow && closeOpenRow !== closeRef.current) closeOpenRow();
    }
    if (d.axis !== 'x') return;
    suppressClick.current = true;
    move(Math.max(-d.width, Math.min(0, d.start + dx)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    setDragging(false);
    const pulled = -offsetRef.current;
    if (pulled > d.width * FULL_SWIPE) run(actions[actions.length - 1]);
    else if (pulled > openWidth / 2) {
      move(-openWidth);
      closeOpenRow = closeRef.current;
    } else move(0);
  };
  // A swipe isn't a tap; and tapping an open row closes it instead of opening its link.
  const onClickCapture = (event) => {
    if (suppressClick.current || offsetRef.current < 0) {
      event.preventDefault();
      event.stopPropagation();
      if (!suppressClick.current) move(0);
    }
    suppressClick.current = false;
  };

  const pulled = -offset;
  const stretched = pulled > openWidth; // past the buttons: the last one grows to fill
  return (
    <div ref={rowRef} className={`swipe-row ${dragging ? 'is-dragging' : ''} ${leaving ? 'is-leaving' : ''} ${className}`}>
      <div className="swipe-row-actions" style={{ width: Math.max(pulled, 0) }} aria-hidden={pulled === 0}>
        {actions.map((action, index) => {
          const last = index === actions.length - 1;
          return (
            <button
              key={action.key}
              type="button"
              className={`swipe-row-action is-${action.tone ?? 'neutral'}`}
              style={{ flex: stretched && last ? '1 0 auto' : `0 0 ${stretched ? ACTION_WIDTH : pulled / actions.length}px` }}
              onClick={() => run(action)}
              tabIndex={pulled === 0 ? -1 : 0}
            >
              <Icon name={action.icon} size={20} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
      <div
        className="swipe-row-content"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onDragStart={(event) => event.preventDefault()} /* a link's own drag-and-drop would cancel the swipe */
      >
        {children}
      </div>
    </div>
  );
}
