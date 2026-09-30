// "Finish session" sheet: cash-out (with live net result), star rating, tilt and final notes.
// Hands played isn't asked: it's worked out from the time at the table (30 hands an hour).
import { useState } from 'react';
import { finishSession } from '../../api/sessions.js';
import { formatDuration, formatMoney } from '../../utils/format.js';
import Modal from '../../components/Modal/Modal.jsx';
import Money from '../../components/Money/Money.jsx';
import StarRating from '../../components/StarRating/StarRating.jsx';
import TiltMeter from '../../components/TiltMeter/TiltMeter.jsx';
import './FinishSessionSheet.css';

const HANDS_PER_HOUR = 30; // live tables deal about 30 hands an hour

export default function FinishSessionSheet({ open, session, elapsedMs, onClose, onFinished }) {
  const [cashOut, setCashOut] = useState('');
  const [rating, setRating] = useState(0);
  const [tilt, setTilt] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const minutesPlayed = Math.max(1, Math.round(elapsedMs / 60000));
  const handsEstimate = Math.max(1, Math.round((minutesPlayed / 60) * HANDS_PER_HOUR));
  const cashOutValue = cashOut === '' ? null : Number(cashOut);
  const net = cashOutValue == null ? null : cashOutValue - session.buyIn;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (cashOutValue == null || !(cashOutValue >= 0)) {
      setError('Enter how much you cashed out (0 if you busted).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const finished = await finishSession(session.id, {
        cashOut: cashOutValue,
        rating: rating > 0 ? rating : null, // 0 stars means "not rated"
        tilt,
        notes: notes.trim(),
      });
      onFinished(finished);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Finish session">
      <form className="finish-sheet" onSubmit={handleSubmit}>
        {/* Result */}
        <section className="finish-sheet-section">
          <label className="finish-sheet-label" htmlFor="finish-cash-out">
            Cash-out
          </label>
          <div className="finish-sheet-money">
            <span aria-hidden="true">$</span>
            <input
              id="finish-cash-out"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              value={cashOut}
              onChange={(event) => setCashOut(event.target.value)}
            />
          </div>
          <div className="finish-sheet-summary">
            <span>
              Buy-in {formatMoney(session.buyIn, { sign: false })} · {formatDuration(minutesPlayed)}
            </span>
            {net != null && <Money amount={net} className="finish-sheet-net" />}
          </div>
        </section>

        <p className="finish-sheet-hands">
          About <strong className="num">{handsEstimate}</strong> hands played ({HANDS_PER_HOUR} per hour at the table)
        </p>

        <section className="finish-sheet-section">
          <h3 className="finish-sheet-label">Rate your session</h3>
          <StarRating value={rating} onChange={setRating} label="Session rating" />
        </section>

        <section className="finish-sheet-section">
          <h3 className="finish-sheet-label">How tilted were you?</h3>
          <TiltMeter value={tilt} onChange={setTilt} />
        </section>

        <section className="finish-sheet-section">
          <label className="finish-sheet-label" htmlFor="finish-notes">
            Session notes
          </label>
          <textarea
            id="finish-notes"
            className="finish-sheet-input"
            rows={3}
            placeholder="What went well? What will you work on?"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </section>

        {error && (
          <p className="finish-sheet-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn finish-sheet-submit" disabled={saving}>
          {saving ? 'Saving' : 'Finish and save'}
        </button>
      </form>
    </Modal>
  );
}
