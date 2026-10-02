// Right pane of Hand Review: the table (board, your hand, villain hands), action replay, and your review
// (verdict, star rating, tilt, notes). "Edit" opens a sheet to fix the hand's details or delete it.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { VERDICTS } from '../../constants/poker.js';
import { bigBlindOf, formatLongDate, formatMoney } from '../../utils/format.js';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Money from '../../components/Money/Money.jsx';
import VerdictBadge from '../../components/VerdictBadge/VerdictBadge.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import StarRating from '../../components/StarRating/StarRating.jsx';
import TiltMeter from '../../components/TiltMeter/TiltMeter.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import ActionTimeline from './ActionTimeline.jsx';
import EditHandSheet from './EditHandSheet.jsx';
import { coachSupport } from '../../coach/savedHand.js';
import { replayStreets } from '../../practice/replaySpot.js';
import './HandDetail.css';

const VERDICT_OPTIONS = Object.entries(VERDICTS).map(([value, label]) => ({ value, label }));
const BOARD_SLOTS = [0, 1, 2, 3, 4];

// Villains in the hand. Hands recorded with Add Hand store their players; for older hands,
// the villains are everyone besides the hero who acted and never folded (cards unknown).
function villainsOf(hand) {
  if (hand.players) return hand.players.filter((p) => p.role === 'villain');
  const actors = new Map();
  for (const street of hand.streets) {
    for (const action of street.actions) {
      if (action.actor === 'Hero') continue;
      const villain = actors.get(action.actor) ?? { position: action.actor, cards: [], folded: false };
      if (action.verb === 'folds') villain.folded = true;
      actors.set(action.actor, villain);
    }
  }
  return [...actors.values()].filter((v) => !v.folded);
}

// onUpdate(changes, persist): review edits. onEdited(hand) / onDeleted(): after the Edit hand sheet saves or deletes.
export default function HandDetail({ hand, backTo, onUpdate, onEdited, onDeleted }) {
  const [editOpen, setEditOpen] = useState(false);
  const villains = villainsOf(hand);
  // Every Hold'em hand can be reviewed by the coach (missing details are rebuilt from the log).
  const coach = coachSupport(hand);
  const replayFrom = coach.ok ? replayStreets(hand) : [];
  const replayLink = (street) => (replayFrom.includes(street) ? `/practice?hand=${hand.id}&street=${street}` : null);

  return (
    <article className="hand-detail">
      <div className="hand-detail-toolbar">
        {/* Back link only shows on phones/tablets, where the list is hidden */}
        <Link to={backTo} className="hand-detail-back btn btn-ghost">
          <Icon name="chevronLeft" size={18} /> All hands
        </Link>
        <button type="button" className="btn btn-ghost hand-detail-edit" onClick={() => setEditOpen(true)}>
          <Icon name="pencil" size={16} /> Edit hand
        </button>
      </div>

      <header className="hand-detail-header">
        <div>
          <p className="hand-detail-meta">
            {formatLongDate(hand.date)} · {hand.game} {hand.stakes} · {hand.heroPosition}
          </p>
          <h2 className="hand-detail-title">{hand.title}</h2>
        </div>
        <div className="hand-detail-header-side">
          <VerdictBadge verdict={hand.verdict} />
          {hand.coachAccuracy != null && <span className="hand-detail-coach-score">Coach {hand.coachAccuracy}%</span>}
        </div>
      </header>

      {coach.ok ? (
        <Link to={`/coach?hand=${hand.id}`} className="btn hand-detail-coach">
          <Icon name="coach" size={16} /> {hand.coachAccuracy != null ? 'Coach review again' : 'Coach review'}
        </Link>
      ) : (
        <p className="hand-detail-coach-off">
          <Icon name="coach" size={16} /> {coach.reason}
        </p>
      )}

      {/* Replay: take the hand from a street into Practice and play it differently */}
      {coach.ok && replayFrom.length > 0 && (
        <div className="hand-detail-replay">
          <span className="hand-detail-replay-label">
            <Icon name="undo" size={16} /> Replay from
          </span>
          {replayFrom.map((street) => (
            <Link key={street} to={replayLink(street)} className="filter-chip">
              {street}
            </Link>
          ))}
        </div>
      )}

      {/* Felt table: board on top, then your hand next to the villains' (face down unless shown) */}
      <div className="hand-detail-table">
        <div className="hand-detail-row">
          <span className="hand-detail-label">Board</span>
          <div className="hand-detail-cards">
            {BOARD_SLOTS.map((slot) => (
              <PlayingCard key={slot} code={hand.board[slot]} size="lg" />
            ))}
          </div>
        </div>

        <div className="hand-detail-hands">
          <div className="hand-detail-row">
            <span className="hand-detail-label">Your hand</span>
            <div className="hand-detail-cards">
              {hand.holeCards.map((code) => (
                <PlayingCard key={code} code={code} size="lg" />
              ))}
            </div>
          </div>

          {villains.map((villain) => {
            const shown = villain.cards?.length === 2;
            return (
              <div key={villain.position} className={`hand-detail-row is-villain ${villain.folded ? 'is-folded' : ''}`}>
                <span className="hand-detail-label">
                  Villain hand · {villain.position}
                  {villain.allIn && <span className="hand-detail-allin">All in</span>}
                  {villain.folded && <span className="hand-detail-folded">Folded</span>}
                </span>
                <div className="hand-detail-cards">
                  {shown
                    ? villain.cards.map((code) => <PlayingCard key={code} code={code} size="lg" />)
                    : [0, 1].map((i) => <PlayingCard key={i} faceDown size="lg" />)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hand-detail-hero">
          <dl className="hand-detail-numbers">
            <div>
              <dt>Final pot</dt>
              <dd className="num">{formatMoney(hand.potSize, { sign: false, bb: bigBlindOf(hand.stakes) })}</dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd>
                <Money amount={hand.result} bb={bigBlindOf(hand.stakes)} className="hand-detail-result" />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="hand-detail-section">
        <h3 className="hand-detail-section-title">Action</h3>
        <ActionTimeline streets={hand.streets} board={hand.board} bb={bigBlindOf(hand.stakes)} replayLink={replayLink} />
      </section>

      {/* The user's own review: verdict, star rating, tilt and notes (each saved as it changes) */}
      <section className="hand-detail-section">
        <h3 className="hand-detail-section-title">Your review</h3>
        <FilterChips options={VERDICT_OPTIONS} value={hand.verdict} onChange={(verdict) => onUpdate({ verdict })} label="Verdict" />

        <span className="hand-detail-note-label">Rate how you played it</span>
        <StarRating
          value={hand.rating ?? 0}
          label="Hand rating"
          onChange={(rating) => onUpdate({ rating }, false)}
          onChangeEnd={(rating) => onUpdate({ rating: rating > 0 ? rating : null })}
        />

        <span className="hand-detail-note-label">How tilted were you in this hand?</span>
        <TiltMeter value={hand.tilt ?? null} onChange={(tilt) => onUpdate({ tilt })} />

        <label className="hand-detail-note-label" htmlFor={`note-${hand.id}`}>
          Notes
        </label>
        <textarea
          id={`note-${hand.id}`}
          className="hand-detail-note"
          rows={4}
          value={hand.note ?? ''}
          placeholder="What would you do differently?"
          onChange={(event) => onUpdate({ note: event.target.value }, false)}
          onBlur={(event) => onUpdate({ note: event.target.value })}
        />
        <div className="hand-detail-tags">
          {(hand.tags ?? []).map((tag) => (
            <span key={tag} className="hand-detail-tag">
              {tag}
            </span>
          ))}
        </div>
      </section>

      {editOpen && (
        <EditHandSheet
          hand={hand}
          onClose={() => setEditOpen(false)}
          onSaved={(saved) => {
            setEditOpen(false);
            onEdited(saved);
          }}
          onDeleted={onDeleted}
        />
      )}
    </article>
  );
}
