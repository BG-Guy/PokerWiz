// Read on one player: their tendency (Nit, LAG, Drunk...) and their skill level (Beginner ... Pro), picked
// separately. Used by the coach's reads step, the saved-hand review and Practice setup.
import { TENDENCIES, LEVELS, applyPreset, applyLevel, levelOf } from '../../coach/profiles.js';
import '../FilterChips/FilterChips.css';
import './ReadPicker.css';

export default function ReadPicker({ profile, onChange, isHero = false, compact = false, disabled = false }) {
  const tendency = TENDENCIES.find((t) => t.id === profile.preset);
  const level = levelOf(profile);

  return (
    <div className={`read-picker ${compact ? 'is-compact' : ''}`}>
      <div className="read-picker-group" role="group" aria-label={isHero ? 'Your style' : 'Tendency'}>
        <span className="read-picker-label">{isHero ? 'Your style' : 'Tendency'}</span>
        <div className="read-picker-chips">
          {TENDENCIES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`filter-chip ${profile.preset === t.id ? 'is-active' : ''}`}
              aria-pressed={profile.preset === t.id}
              disabled={disabled}
              onClick={() => onChange(applyPreset(profile, t.id))}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!compact && <p className="read-picker-description">{tendency ? tendency.description : 'Custom style: set by the meters below.'}</p>}
      </div>

      <div className="read-picker-group" role="group" aria-label={isHero ? 'Your level' : 'Skill level'}>
        <span className="read-picker-label">{isHero ? 'Your level' : 'Skill level'}</span>
        <div className="read-picker-chips">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`filter-chip ${level.id === l.id ? 'is-active' : ''}`}
              aria-pressed={level.id === l.id}
              disabled={disabled}
              onClick={() => onChange(applyLevel(profile, l.id))}
            >
              {l.label}
            </button>
          ))}
        </div>
        {!compact && (
          <p className="read-picker-description">
            {isHero ? 'Sets how strictly the coach grades you.' : level.description}
          </p>
        )}
      </div>
    </div>
  );
}
