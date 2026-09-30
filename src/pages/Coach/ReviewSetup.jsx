// Header for a coach review of a saved hand: which hand it is, what the coach had to assume, and quick
// reads (player type per villain, your level) that re-run the analysis when changed.
import { Link } from 'react-router-dom';
import { PRESETS, defaultProfile } from '../../coach/profiles.js';
import Icon from '../../components/Icon/Icon.jsx';
import './ReviewSetup.css';

// Your level sets how strictly the coach grades (tolerance for small EV differences).
export const LEVELS = [
  { label: 'Amateur', skill: 20 },
  { label: 'Regular', skill: 50 },
  { label: 'Pro', skill: 85 },
];

export default function ReviewSetup({ hand, record, assumptions, busy, status, onReadChange, onLevelChange }) {
  const villains = record.players.filter((p) => p.role === 'villain');
  const heroSkill = (record.players.find((p) => p.role === 'hero').profile ?? defaultProfile()).skill;
  const level = LEVELS.reduce((a, b) => (Math.abs(b.skill - heroSkill) < Math.abs(a.skill - heroSkill) ? b : a));
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

      {/* Reads: tap a player type and the coach re-runs */}
      <div className="review-setup-reads">
        {villains.map((villain) => (
          <div key={villain.seat} className="review-setup-read">
            <span className="review-setup-read-name">
              <Icon name="villain" size={14} /> {villain.position}
            </span>
            <div className="review-setup-chips">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`filter-chip ${(villain.profile?.preset ?? 'unknown') === preset.id ? 'is-active' : ''}`}
                  disabled={busy}
                  onClick={() => onReadChange(villain.position, preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="review-setup-read">
          <span className="review-setup-read-name">
            <Icon name="hero" size={14} /> Your level
          </span>
          <div className="review-setup-chips">
            {LEVELS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`filter-chip ${option === level ? 'is-active' : ''}`}
                disabled={busy}
                onClick={() => onLevelChange(option.skill)}
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
