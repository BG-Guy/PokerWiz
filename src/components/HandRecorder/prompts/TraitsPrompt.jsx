// Coach-mode step: reads on every player. Pick a tendency (Nit, LAG, Drunk...) and a skill level (Beginner ...
// Pro), then fine-tune the trait meters. For the hero, the meters describe your table image (how villains
// react to your bets), your level (how strictly the coach grades) and your state (tilt, heater / cold run).
import { useState } from 'react';
import { TRAITS, describeProfile, setTrait } from '../../../coach/profiles.js';
import ReadPicker from '../../ReadPicker/ReadPicker.jsx';
import TraitMeter from '../../TraitMeter/TraitMeter.jsx';
import Icon from '../../Icon/Icon.jsx';
import './TraitsPrompt.css';

export default function TraitsPrompt({ players, profiles, onChange, onContinue }) {
  // Villains first (they matter most), then the hero.
  const ordered = [...players.filter((p) => p.role === 'villain'), ...players.filter((p) => p.role === 'hero')];
  const [activeSeat, setActiveSeat] = useState(ordered[0].seat);
  const player = ordered.find((p) => p.seat === activeSeat);
  const profile = profiles[activeSeat];
  const isHero = player.role === 'hero';

  return (
    <>
      <span className="prompt-kicker">
        <Icon name="target" size={14} /> Reads
      </span>
      <h2 className="prompt-title">{isHero ? 'How does the table see you?' : 'What do you know about them?'}</h2>
      <p className="prompt-text">
        {isHero
          ? 'Your image changes how villains respond to your bets. Your level sets how strict the coach is.'
          : 'Pick how they play and how good they are, then fine-tune. Reads change their ranges and how often they fold, call and bluff.'}
      </p>

      {/* One tab per player */}
      <div className="traits-tabs" role="tablist" aria-label="Players">
        {ordered.map((p) => (
          <button
            key={p.seat}
            type="button"
            role="tab"
            aria-selected={p.seat === activeSeat}
            className={`traits-tab ${p.seat === activeSeat ? 'is-active' : ''}`}
            onClick={() => setActiveSeat(p.seat)}
          >
            <span className={`prompt-player-avatar is-${p.role}`}>
              <Icon name={p.role} size={16} />
            </span>
            <span className="traits-tab-text">
              <span className="traits-tab-name">{p.role === 'hero' ? 'You' : p.position}</span>
              <span className="traits-tab-label">{describeProfile(profiles[p.seat]).label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Tendency and skill level */}
      <ReadPicker profile={profile} isHero={isHero} onChange={(next) => onChange(activeSeat, next)} />

      {/* Fine-tuning meters */}
      <div className="traits-meters">
        {TRAITS.map((trait) => (
          <TraitMeter
            key={trait.key}
            label={isHero ? trait.heroLabel : trait.label}
            low={trait.low}
            high={trait.high}
            value={profile[trait.key]}
            onChange={(value) => onChange(activeSeat, setTrait(profile, trait.key, value))}
          />
        ))}
      </div>

      <div className="prompt-actions">
        <button type="button" className="btn" onClick={onContinue}>
          Next <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </>
  );
}
