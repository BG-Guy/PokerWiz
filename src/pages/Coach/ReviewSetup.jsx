// Header for a coach review of a saved hand: which hand it is, what the coach had to assume, and quick
// reads (tendency and skill level per villain, your level) that re-run the analysis when changed.
import { Link } from 'react-router-dom';
import { LEVELS, applyLevel, defaultProfile, levelOf } from '../../coach/profiles.js';
import ReadPicker from '../../components/ReadPicker/ReadPicker.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './ReviewSetup.css';

// onReadChange(position, profile) for a villain; onHeroChange(profile) for your level (how strictly the coach grades).
export default function ReviewSetup({ hand, record, assumptions, busy, status, onReadChange, onHeroChange }) {
  const villains = record.players.filter((p) => p.role === 'villain');
  const heroProfile = record.players.find((p) => p.role === 'hero').profile ?? defaultProfile();
  const level = levelOf(heroProfile);
  // The "no reads" note goes away once any villain has a read.
  const shown = villains.some((v) => v.profile) ? assumptions.filter((a) => a.id !== 'reads') : assumptions;

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

      {shown.length > 0 && (
        <ul className="review-setup-assumptions">
          {shown.map((assumption) => (
            <li key={assumption.id}>
              <Icon name="alert" size={14} />
              <span>{assumption.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Reads: change a tendency or level and the coach re-runs */}
      <div className="review-setup-reads">
        {villains.map((villain) => (
          <div key={villain.seat} className="review-setup-read">
            <span className="review-setup-read-name">
              <Icon name="villain" size={14} /> {villain.position}
            </span>
            <ReadPicker compact profile={villain.profile ?? defaultProfile()} disabled={busy} onChange={(next) => onReadChange(villain.position, next)} />
          </div>
        ))}
        <div className="review-setup-read">
          <span className="review-setup-read-name">
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
      </div>

      <p className="review-setup-status" aria-live="polite">
        {busy ? 'Re-analyzing with the new reads...' : status}
      </p>
    </section>
  );
}
