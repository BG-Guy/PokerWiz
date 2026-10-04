// Draggable 0-5 star rating with one decimal (e.g. 4.5, 4.8). Drag or tap across the stars to fill them.
// On touch screens the stars get bigger, a value bubble floats above the finger, and each whole star gives a light buzz.
// readOnly renders a small static version (used in session history).
import { useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import './StarRating.css';

const STAR_PATH = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';

// Word shown next to the number.
export function ratingLabel(value) {
  if (value < 1.5) return 'Rough';
  if (value < 2.5) return 'Meh';
  if (value < 3.5) return 'Decent';
  if (value < 4.5) return 'Great';
  return 'Outstanding';
}

const clampRating = (v) => Math.min(5, Math.max(0, Math.round(v * 10) / 10));

// A row of five stars; the filled row is laid over the empty row and clipped to the value.
function StarRow({ className }) {
  return (
    <span className={className} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

// onChangeEnd (optional) is called once with the final value when a drag or key press ends, e.g. to save it.
export default function StarRating({ value, onChange, onChangeEnd, readOnly = false, label = 'Rating' }) {
  const trackRef = useRef(null);
  const latestValue = useRef(value);
  const lastWholeStar = useRef(Math.floor(value));
  const [dragging, setDragging] = useState(false);
  const isTouch = useMediaQuery('(pointer: coarse)');
  const percent = (value / 5) * 100;

  if (readOnly) {
    return (
      <span className="star-rating is-readonly" role="img" aria-label={`${label}: ${value.toFixed(1)} out of 5`}>
        <span className="star-rating-track">
          <StarRow className="star-rating-empty" />
          <span className="star-rating-fill" style={{ width: `${percent}%` }}>
            <StarRow className="star-rating-full" />
          </span>
        </span>
      </span>
    );
  }

  // Convert a pointer x position into a rating, snapped to 0.1.
  const setFromPointer = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const next = clampRating(((clientX - rect.left) / rect.width) * 5);
    if (isTouch && Math.floor(next) !== lastWholeStar.current) {
      navigator.vibrate?.(8);
      lastWholeStar.current = Math.floor(next);
    }
    latestValue.current = next;
    onChange(next);
  };

  // Pointer capture keeps the drag going even if the finger slides off the stars.
  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setFromPointer(event.clientX);
  };
  const handlePointerMove = (event) => dragging && setFromPointer(event.clientX);
  const stopDragging = () => {
    if (!dragging) return;
    setDragging(false);
    onChangeEnd?.(latestValue.current);
  };

  // Keyboard: arrows move 0.1 (Shift = 0.5), Home/End jump to the ends.
  const handleKeyDown = (event) => {
    const step = event.shiftKey ? 0.5 : 0.1;
    const moves = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
    let next;
    if (event.key in moves) next = clampRating(value + moves[event.key]);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 5;
    else return;
    event.preventDefault();
    onChange(next);
    onChangeEnd?.(next);
  };

  return (
    <div className={`star-rating ${isTouch ? 'is-touch' : ''} ${dragging ? 'is-dragging' : ''}`}>
      <div
        ref={trackRef}
        className="star-rating-track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-valuetext={value > 0 ? `${value.toFixed(1)} stars, ${ratingLabel(value)}` : 'Not rated'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={handleKeyDown}
      >
        <StarRow className="star-rating-empty" />
        <span className="star-rating-fill" style={{ width: `${percent}%` }}>
          <StarRow className="star-rating-full" />
        </span>

        {/* Thumb at the fill edge, with a bubble that floats above the finger/cursor */}
        <span className="star-rating-thumb" style={{ left: `${percent}%` }}>
          <span className="star-rating-bubble num">{value.toFixed(1)}</span>
        </span>
      </div>

      {/* The value and its word; zero stars means not rated yet */}
      <div className="star-rating-readout">
        {value > 0 ? (
          <>
            <span className="star-rating-value num">{value.toFixed(1)}</span>
            <span className="star-rating-label">{ratingLabel(value)}</span>
          </>
        ) : (
          <span className="star-rating-label is-unrated">Not rated</span>
        )}
      </div>
      <p className="star-rating-hint">{isTouch ? 'Slide your finger across the stars' : 'Drag across the stars, or use the arrow keys'}</p>
    </div>
  );
}
