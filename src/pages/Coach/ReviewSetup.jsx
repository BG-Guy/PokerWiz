// Header for a coach review of a saved hand: which hand it is, a note on what the coach had to assume (tap it for
// the list), who you played against (a chip per villain: tap one to set a read, and the review re-runs against
// it), and your level (how strictly you're graded).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS, applyLevel, defaultProfile, describeProfile, levelOf } from '../../coach/profiles.js';
import { modelFor } from '../../gto/players/models.js';
import { PLAYER_READS } from '../../gto/config.js';
import { useClosingValue } from '../../hooks/useClosingValue.js';
import Modal from '../../components/Modal/Modal.jsx';
import ReadChip from '../../components/ReadChip/ReadChip.jsx';
import ReadSheet from '../../components/ReadSheet/ReadSheet.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './ReviewSetup.css';

// onReadChange(position, profile) for a villain; onHeroChange(profile) for your level (how strictly the coach grades).
export default function ReviewSetup({ hand, record, assumptions, busy, status, onReadChange, onHeroChange }) {
  const [reading, setReading] = useState(null); // the seat whose read is being set
  const [readingSeat, readingOpen] = useClosingValue(reading);
  const [listed, setListed] = useState(false); // the list of assumptions
  const villains = record.players.filter((p) => p.role === 'villain');
  const heroProfile = record.players.find((p) => p.role === 'hero').profile ?? defaultProfile();
  const level = levelOf(heroProfile);
  // The "no reads" note goes away once any villain has a read.
  const shown = !PLAYER_READS || villains.some((v) => modelFor(v.profile)) ? assumptions.filter((a) => a.id !== 'reads') : assumptions;
  const picked = villains.find((v) => v.position === readingSeat);

  return (
    <section className={`review-setup ${busy ? 'is-busy' : ''}`}>
      <div className="review-setup-top">
        <div>
          <span className="review-setup-kicker">Coach review</span>
          <h2 className="review-setup-title">{hand.title}</h2>
        </div>
        <Link to={`/hands/${hand.id}`} className="btn btn-ghost">
          <Icon name="chevronLeft" size={16} /> Back to hand
        </Link>
      </div>

      {/* What the coach had to guess, in one line; the list is a tap away */}
      {shown.length > 0 && (
        <button type="button" className="review-setup-assumed" onClick={() => setListed(true)} aria-haspopup="dialog">
          <Icon name="alert" size={16} />
          <span className="review-setup-assumed-text">
            <strong>{shown.length === 1 ? 'The coach made an assumption' : `The coach made ${shown.length} assumptions`}</strong>
            <span>Tap to see what it assumed</span>
          </span>
          <Icon name="chevronRight" size={16} />
        </button>
      )}

      {/* Who you played against: a read changes how they play, and so what the best play is */}
      {PLAYER_READS && villains.length > 0 && (
        <div className="review-setup-group">
          <span className="review-setup-label">Who you played against</span>
          <div className="review-setup-chiprow">
            {villains.map((villain) => (
              <ReadChip
                key={villain.seat}
                position={villain.position}
                label={modelFor(villain.profile) ? describeProfile(villain.profile).label : 'No read'}
                isSet={Boolean(modelFor(villain.profile))}
                disabled={busy}
                onClick={() => setReading(villain.position)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Your level: how strictly the coach grades you */}
      <div className="review-setup-group">
        <span className="review-setup-label">
          <Icon name="hero" size={14} /> Your level
        </span>
        <div className="review-setup-chips">
          {LEVELS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`filter-chip ${option.id === level.id ? 'is-active' : ''}`}
              disabled={busy}
              onClick={() => onHeroChange(applyLevel(heroProfile, option.id))}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="review-setup-status" aria-live="polite">
        {busy ? 'Re-analyzing...' : status}
      </p>

      <ReadSheet
        open={readingOpen}
        onClose={() => setReading(null)}
        title={picked ? `Read on ${picked.position}` : 'Read'}
        profile={picked?.profile ?? null}
        onApply={(profile) => picked && onReadChange(picked.position, profile)}
      />
      <Modal open={listed} onClose={() => setListed(false)} title="What the coach assumed">
        <ul className="review-setup-assumptions">
          {shown.map((assumption) => (
            <li key={assumption.id}>
              <Icon name="alert" size={14} />
              <span>{assumption.text}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
