// Flag a graded decision you think the engine got wrong. The flag (with the whole hand) stays on this device
// until you export it from Profile; once flagged, a note field asks what looks wrong.
import { useState } from 'react';
import Icon from '../Icon/Icon.jsx';
import { useFlags } from '../../hooks/useFlags.js';
import { addFlag, removeFlag, setFlagNote, flagId } from '../../utils/flags.js';
import './FlagButton.css';

// context: { source: 'review' | 'practice', record (the hand), detail ('full' | 'fast') }; decision: the graded decision.
export default function FlagButton({ context, decision }) {
  const flags = useFlags();
  const id = flagId(context.source, context.record, decision.index);
  const flag = flags.find((f) => f.id === id);
  const [note, setNote] = useState(flag?.note ?? '');
  const [failed, setFailed] = useState(false);

  // Flag or unflag; a new flag starts with an empty note.
  const toggle = () => {
    const saved = flag ? removeFlag(id) : addFlag({ ...context, decision });
    setFailed(!saved);
    if (!flag) setNote('');
  };

  return (
    <div className={`flag-button ${flag ? 'is-flagged' : ''}`}>
      <button type="button" className="flag-button-toggle" onClick={toggle} aria-pressed={Boolean(flag)} title={flag ? 'Remove the flag' : 'Flag this decision for review'}>
        <Icon name="flag" size={14} />
        <span>{flag ? 'Flagged' : 'Flag'}</span>
      </button>
      {/* What looks wrong, saved as you type (closing the sheet mid-note keeps it) */}
      {flag && (
        <input
          className="flag-button-note"
          type="text"
          value={note}
          placeholder="What looks wrong? (optional)"
          onChange={(event) => {
            setNote(event.target.value);
            setFlagNote(id, event.target.value);
          }}
          aria-label="What looks wrong with this decision"
        />
      )}
      {failed && <span className="flag-button-error">This device didn't save the flag (storage is full or blocked).</span>}
    </div>
  );
}
