// The sheet for setting a read on a player: how they play (a grid of player types, each with its usual numbers),
// how well, and in a sentence how to adjust against them. "Use this read" applies it (the coach or Practice
// re-runs with it); "Reset to GTO" takes it away. Changes stay in the sheet until applied.
import { useEffect, useState } from 'react';
import Modal from '../Modal/Modal.jsx';
import Icon from '../Icon/Icon.jsx';
import { TENDENCIES, LEVELS, applyPreset, applyLevel, defaultProfile, describeProfile, levelOf } from '../../coach/profiles.js';
import './ReadSheet.css';

// "Plays many hands... (about 40/8)" -> "40 / 8" (how many hands they play / how many they raise, in percent).
const statsOf = (tendency) => /about (\d+)\/(\d+)/.exec(tendency.description)?.slice(1, 3).join(' / ') ?? null;

// profile: the read now (or null for none). onApply(profile): the new read (the default profile for "no read").
export default function ReadSheet({ open, onClose, title, profile, onApply }) {
  const [draft, setDraft] = useState(profile ?? defaultProfile());
  // Each time the sheet opens it starts from the read as it is.
  useEffect(() => {
    if (open) setDraft(profile ?? defaultProfile());
  }, [open, profile]);

  const tendency = TENDENCIES.find((t) => t.id === draft.preset);
  const level = levelOf(draft);
  const { label } = describeProfile(draft);

  return (
    <Modal open={open} onClose={onClose} title={title} expandable>
      <div className="read-sheet">
        <header className="read-sheet-lead">
          <span className="read-sheet-label">{tendency?.id === 'unknown' && level.id === 'regular' ? 'No read' : label}</span>
          <p className="read-sheet-text">{tendency ? tendency.description : 'A custom style, set by the meters.'}</p>
        </header>

        <section className="read-sheet-section">
          <h3 className="read-sheet-heading">How they play</h3>
          <div className="read-sheet-grid" role="group" aria-label="How they play">
            {TENDENCIES.map((t) => (
              <button key={t.id} type="button" className={`read-sheet-card ${t.id === draft.preset ? 'is-active' : ''}`} aria-pressed={t.id === draft.preset} onClick={() => setDraft(applyPreset(draft, t.id))}>
                <span className="read-sheet-card-name">{t.label}</span>
                {statsOf(t) && <span className="read-sheet-card-stats num">{statsOf(t)}</span>}
              </button>
            ))}
          </div>
          <p className="read-sheet-legend">The numbers are the share of hands they play and the share they raise.</p>
        </section>

        {tendency?.exploit && (
          <p className="read-sheet-exploit">
            <Icon name="bulb" size={16} />
            <span>
              <strong>How to adjust.</strong> {tendency.exploit}
            </span>
          </p>
        )}

        <section className="read-sheet-section">
          <h3 className="read-sheet-heading">How well</h3>
          <div className="read-sheet-levels" role="group" aria-label="How well they play">
            {LEVELS.map((l) => (
              <button key={l.id} type="button" className={`filter-chip ${l.id === level.id ? 'is-active' : ''}`} aria-pressed={l.id === level.id} onClick={() => setDraft(applyLevel(draft, l.id))}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="read-sheet-legend">{level.description}</p>
        </section>

        <div className="read-sheet-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Use this read
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              onApply(defaultProfile());
              onClose();
            }}
          >
            Reset to GTO
          </button>
        </div>
      </div>
    </Modal>
  );
}
