// A hand's rating in the Hands list. Rated: a pill colored by how well you played it (★ 4.5 · Great).
// Not rated yet: a dashed "Rate" pill. Either one opens a small star picker right in the list, so hands can be
// rated (or re-rated) without opening them.
import { useEffect, useRef, useState } from 'react';
import StarRating, { ratingLabel } from '../../components/StarRating/StarRating.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './RatingPill.css';

// Color tier for a rating, matching its word (ratingLabel): good is Great or Outstanding (3.5+), okay is Decent
// (2.5+), poor is Meh or Rough.
export const ratingTier = (value) => (value >= 3.5 ? 'good' : value >= 2.5 ? 'okay' : 'poor');

// onRate(value | null) saves a new rating (null clears it).
export default function RatingPill({ rating, title, onRate }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rating ?? 0);
  const wrapRef = useRef(null);
  const rated = rating != null;

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => !wrapRef.current?.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setDraft(rating ?? 0);
    setOpen((o) => !o);
  };
  const save = (value) => onRate(value > 0 ? Math.round(value * 10) / 10 : null);

  return (
    <span className="rating-pill-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`rating-pill ${rated ? `is-${ratingTier(rating)}` : 'is-unrated'}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={rated ? `Rated ${rating.toFixed(1)} out of 5: change the rating of ${title}` : `Rate ${title}`}
      >
        <Icon name="star" size={14} />
        {rated ? (
          <>
            <span className="num">{rating.toFixed(1)}</span>
            <span className="rating-pill-word">{ratingLabel(rating)}</span>
          </>
        ) : (
          <span>Rate</span>
        )}
      </button>

      {/* Quick rating: drag across the stars; letting go saves */}
      {open && (
        <span className="rating-pill-popover" role="dialog" aria-label={`Rate ${title}`}>
          <span className="rating-pill-popover-title">How did you play it?</span>
          <StarRating
            value={draft}
            label="Hand rating"
            onChange={setDraft}
            onChangeEnd={(value) => {
              save(value);
              setOpen(false);
            }}
          />
          {rated && (
            <button
              type="button"
              className="btn btn-ghost rating-pill-clear"
              onClick={() => {
                save(0);
                setOpen(false);
              }}
            >
              Clear rating
            </button>
          )}
        </span>
      )}
    </span>
  );
}
