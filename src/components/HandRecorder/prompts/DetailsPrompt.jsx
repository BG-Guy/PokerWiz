// Final step: result summary, title, verdict, star rating, tilt and notes, then save.
import { useState } from 'react';
import { VERDICTS } from '../../../constants/poker.js';
import { formatMoney } from '../../../utils/format.js';
import FilterChips from '../../FilterChips/FilterChips.jsx';
import Money from '../../Money/Money.jsx';
import StarRating from '../../StarRating/StarRating.jsx';
import TiltMeter from '../../TiltMeter/TiltMeter.jsx';
import Icon from '../../Icon/Icon.jsx';

const VERDICT_OPTIONS = Object.entries(VERDICTS).map(([value, label]) => ({ value, label }));

export default function DetailsPrompt({ defaultTitle, result, pot, saving, error, onSave }) {
  const [title, setTitle] = useState(defaultTitle);
  const [verdict, setVerdict] = useState('review');
  const [note, setNote] = useState('');
  const [rating, setRating] = useState(0);
  const [tilt, setTilt] = useState(null);

  return (
    <>
      <span className="prompt-kicker">
        <Icon name="check" size={14} /> Wrap up
      </span>
      <h2 className="prompt-title">
        Your result <Money amount={result} />
      </h2>
      <p className="prompt-text">Final pot {formatMoney(pot, { sign: false })}.</p>

      <label className="prompt-field-label" htmlFor="hand-title">
        Title
      </label>
      <input id="hand-title" className="prompt-input" value={title} onChange={(event) => setTitle(event.target.value)} />

      <span className="prompt-field-label">How did you play it?</span>
      <FilterChips options={VERDICT_OPTIONS} value={verdict} onChange={setVerdict} label="Verdict" />

      <span className="prompt-field-label">Rate how you played it</span>
      <StarRating value={rating} onChange={setRating} label="Hand rating" />

      <span className="prompt-field-label">How tilted were you in this hand?</span>
      <TiltMeter value={tilt} onChange={setTilt} />

      <label className="prompt-field-label" htmlFor="hand-note">
        Notes
      </label>
      <textarea
        id="hand-note"
        className="prompt-input"
        rows={3}
        placeholder="Reads, thoughts, what to review later..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {error && (
        <p className="action-prompt-hint" role="alert">
          {error}
        </p>
      )}

      <div className="prompt-actions">
        <button
          type="button"
          className="btn"
          disabled={saving}
          onClick={() => onSave({ title: title.trim() || defaultTitle, verdict, note: note.trim(), rating: rating > 0 ? rating : null, tilt })}
        >
          {saving ? 'Saving' : 'Save hand'} <Icon name="check" size={16} />
        </button>
      </div>
    </>
  );
}
