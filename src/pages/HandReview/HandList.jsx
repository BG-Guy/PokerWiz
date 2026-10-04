// Left pane of Hand Review: search box, verdict filter chips, sort order, and the list of hands. Each row
// shows the hand (cards, title, result, verdict), then your rating (rate or re-rate it right there), how
// tilted you were and the last coach score, and a Coach button.
import { Link } from 'react-router-dom';
import { VERDICTS } from '../../constants/poker.js';
import { bigBlindOf, formatDate } from '../../utils/format.js';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Money from '../../components/Money/Money.jsx';
import VerdictBadge from '../../components/VerdictBadge/VerdictBadge.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import TiltFace from '../../components/TiltMeter/TiltFace.jsx';
import { coachSupport } from '../../coach/savedHand.js';
import RatingPill from './RatingPill.jsx';
import './HandList.css';

// Sort orders for the list (applied by HandReview).
export const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'best', label: 'Best rated' },
  { value: 'worst', label: 'Lowest rated' },
  { value: 'unrated', label: 'Not rated yet' },
];

export default function HandList({
  hands,
  countSource,
  selectedId,
  verdictFilter,
  onVerdictChange,
  sort,
  onSortChange,
  query,
  onQueryChange,
  session,
  onClearSession,
  linkSearch,
  onRate,
}) {
  // Chip options with a count of hands per verdict.
  const verdictOptions = [
    { value: 'all', label: 'All', count: countSource.length },
    ...Object.entries(VERDICTS).map(([value, label]) => ({
      value,
      label,
      count: countSource.filter((hand) => hand.verdict === value).length,
    })),
  ];
  const rated = countSource.filter((hand) => hand.rating != null);
  const average = rated.length ? rated.reduce((sum, hand) => sum + hand.rating, 0) / rated.length : null;

  return (
    <div className="hand-list">
      <label className="hand-list-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="Search hands, cards, tags"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Search hands"
        />
      </label>

      <FilterChips options={verdictOptions} value={verdictFilter} onChange={onVerdictChange} label="Filter by verdict" />

      {/* Sort, with how many hands are rated and their average */}
      <div className="hand-list-toolbar">
        <label className="hand-list-sort">
          <span>Sort</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value)} aria-label="Sort hands">
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={14} />
        </label>
        <span
          className="hand-list-rated"
          title={`${rated.length} of ${countSource.length} hands rated${average != null ? `, ${average.toFixed(1)} stars on average` : ''}`}
        >
          <span className="num">
            {rated.length}/{countSource.length}
          </span>{' '}
          rated
          {average != null && (
            <>
              <span aria-hidden="true">·</span>
              <Icon name="star" size={12} />
              <span className="num">{average.toFixed(1)}</span> avg
            </>
          )}
        </span>
      </div>

      {/* Shown when arriving from a session in Game History */}
      {session && (
        <div className="hand-list-session">
          <span>
            Session: {formatDate(session.date)} · {session.venue}
          </span>
          <button type="button" onClick={onClearSession} aria-label="Show hands from all sessions">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <ul className="hand-list-items">
        {hands.map((hand) => {
          const coach = coachSupport(hand);
          return (
            <li key={hand.id} className={`hand-list-row ${hand.id === selectedId ? 'is-selected' : ''}`}>
              <div className="hand-list-body">
                <Link to={{ pathname: `/hands/${hand.id}`, search: linkSearch }} className="hand-list-item">
                  <span className="hand-list-cards">
                    {hand.holeCards.map((code) => (
                      <PlayingCard key={code} code={code} size="sm" />
                    ))}
                  </span>
                  <span className="hand-list-main">
                    <span className="hand-list-title">{hand.title}</span>
                    <span className="hand-list-meta">
                      {formatDate(hand.date)} · {hand.heroPosition} · {hand.stakes}
                    </span>
                  </span>
                  <span className="hand-list-side">
                    <Money amount={hand.result} bb={bigBlindOf(hand.stakes)} />
                    <VerdictBadge verdict={hand.verdict} />
                  </span>
                </Link>

                {/* Your rating (tap to rate or change it), tilt, and the coach's last score */}
                <div className="hand-list-footer">
                  <RatingPill rating={hand.rating ?? null} title={hand.title} onRate={(rating) => onRate(hand.id, rating)} />
                  {hand.tilt != null && (
                    <span className="hand-list-tilt" title={`Tilt ${hand.tilt} of 5`}>
                      <TiltFace level={hand.tilt} size={18} />
                    </span>
                  )}
                  {hand.coachAccuracy != null && <span className="hand-list-coach-score">Coach {hand.coachAccuracy}%</span>}
                </div>
              </div>

              {/* Coach review for this hand */}
              {coach.ok ? (
                <Link to={`/coach?hand=${hand.id}`} className="hand-list-coach" title="Coach review" aria-label={`Coach review: ${hand.title}`}>
                  <Icon name="coach" size={18} />
                  <span className="hand-list-coach-label">Coach</span>
                </Link>
              ) : (
                <span className="hand-list-coach is-disabled" title={coach.reason} aria-label={coach.reason}>
                  <Icon name="coach" size={18} />
                  <span className="hand-list-coach-label">Coach</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {hands.length === 0 && <p className="hand-list-empty">No hands match. Try another filter.</p>}
    </div>
  );
}
