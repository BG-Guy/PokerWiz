// Left pane of Hand Review: search box, verdict filter chips, and the list of hands.
import { Link } from 'react-router-dom';
import { VERDICTS } from '../../constants/poker.js';
import { formatDate } from '../../utils/format.js';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Money from '../../components/Money/Money.jsx';
import VerdictBadge from '../../components/VerdictBadge/VerdictBadge.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import StarRating from '../../components/StarRating/StarRating.jsx';
import TiltFace from '../../components/TiltMeter/TiltFace.jsx';
import { coachSupport } from '../../coach/savedHand.js';
import './HandList.css';

export default function HandList({
  hands,
  countSource,
  selectedId,
  verdictFilter,
  onVerdictChange,
  query,
  onQueryChange,
  session,
  onClearSession,
  linkSearch,
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
                {/* Your rating, tilt and last coach score for this hand, when set */}
                {(hand.rating != null || hand.tilt != null || hand.coachAccuracy != null) && (
                  <span className="hand-list-feel">
                    {hand.rating != null && (
                      <>
                        <StarRating value={hand.rating} readOnly label="Hand rating" />
                        <span className="num">{hand.rating.toFixed(1)}</span>
                      </>
                    )}
                    {hand.tilt != null && <TiltFace level={hand.tilt} size={16} />}
                    {hand.coachAccuracy != null && <span className="hand-list-coach-score">Coach {hand.coachAccuracy}%</span>}
                  </span>
                )}
              </span>
              <span className="hand-list-side">
                <Money amount={hand.result} />
                <VerdictBadge verdict={hand.verdict} />
              </span>
            </Link>

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
