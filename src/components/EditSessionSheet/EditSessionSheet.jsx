// "Edit session" sheet, for the live session (stakes, venue, buy-in) and for finished sessions in
// Game History (also date, cash-out, time played, hands, rating, tilt and notes). Includes Delete.
// Amounts are entered in dollars. Mount it only while open, so it starts from the saved values.
import { useState } from 'react';
import { deleteSession, updateSession } from '../../api/sessions.js';
import { GAMES, STAKES, VENUES } from '../../constants/poker.js';
import Modal from '../Modal/Modal.jsx';
import FilterChips from '../FilterChips/FilterChips.jsx';
import StarRating from '../StarRating/StarRating.jsx';
import TiltMeter from '../TiltMeter/TiltMeter.jsx';
import { EditFormFooter, Field, MoneyInput } from '../EditForm/EditForm.jsx';

// Stakes chips, plus the session's own stakes if they aren't one of the usual ones.
function stakeOptions(session) {
  const list = STAKES.some((s) => s.label === session.stakes)
    ? STAKES
    : [...STAKES, { label: session.stakes, bb: session.bigBlind }];
  return list.map((s) => ({ value: s.label, label: s.label, bb: s.bb }));
}

const VENUE_OPTIONS = VENUES.map((v) => ({ value: v, label: v }));
const asText = (value) => (value == null ? '' : String(value));

export default function EditSessionSheet({ session, onClose, onSaved, onDeleted }) {
  const isLive = session.status === 'live';
  const stakesChoices = stakeOptions(session);
  const [form, setForm] = useState({
    game: session.game,
    stakes: session.stakes,
    venue: session.venue,
    buyIn: asText(session.buyIn),
    date: session.date,
    cashOut: asText(session.cashOut),
    hours: String(Math.floor(session.durationMin / 60)),
    minutes: String(session.durationMin % 60),
    hands: asText(session.hands),
    rating: session.rating ?? 0,
    tilt: session.tilt ?? null,
    notes: session.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (changes) => setForm((f) => ({ ...f, ...changes }));

  // Turn the form into an API edit, or explain what's wrong.
  const buildChanges = () => {
    const buyIn = Number(form.buyIn);
    if (form.buyIn === '' || !(buyIn >= 0)) return { error: 'Enter the total buy-in (0 or more).' };
    const changes = {
      game: form.game,
      stakes: form.stakes,
      bigBlind: stakesChoices.find((s) => s.value === form.stakes).bb,
      venue: form.venue,
      buyIn,
    };
    if (isLive) return { changes };

    const cashOut = Number(form.cashOut);
    const durationMin = Number(form.hours || 0) * 60 + Number(form.minutes || 0);
    const hands = Number(form.hands);
    if (!form.date) return { error: 'Pick the date you played.' };
    if (form.cashOut === '' || !(cashOut >= 0)) return { error: 'Enter how much you cashed out (0 if you busted).' };
    if (!(Number.isInteger(durationMin) && durationMin > 0)) return { error: 'Enter how long you played.' };
    if (form.hands === '' || !(Number.isInteger(hands) && hands >= 0)) return { error: 'Enter how many hands you played.' };
    return {
      changes: {
        ...changes,
        date: form.date,
        cashOut,
        durationMin,
        hands,
        rating: form.rating > 0 ? form.rating : null, // 0 stars means "not rated"
        tilt: form.tilt,
        notes: form.notes.trim(),
      },
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const { changes, error: problem } = buildChanges();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateSession(session.id, changes));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteSession(session.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit session">
      <form className="edit-form" onSubmit={handleSubmit}>
        {!isLive && (
          <Field label="Date" htmlFor="session-date">
            <input id="session-date" type="date" className="edit-form-input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
        )}

        <Field label="Game">
          <FilterChips options={GAMES} value={form.game} onChange={(game) => set({ game })} label="Game" />
        </Field>
        <Field label="Stakes">
          <FilterChips options={stakesChoices} value={form.stakes} onChange={(stakes) => set({ stakes })} label="Stakes" />
        </Field>
        <Field label="Venue">
          <FilterChips options={VENUE_OPTIONS} value={form.venue} onChange={(venue) => set({ venue })} label="Venue" />
        </Field>

        <div className="edit-form-row">
          <Field label="Total buy-in" htmlFor="session-buy-in" hint={isLive ? 'Topped up? Add it here.' : null}>
            <MoneyInput id="session-buy-in" value={form.buyIn} onChange={(buyIn) => set({ buyIn })} label="Total buy-in in dollars" />
          </Field>
          {!isLive && (
            <Field label="Cash-out" htmlFor="session-cash-out">
              <MoneyInput id="session-cash-out" value={form.cashOut} onChange={(cashOut) => set({ cashOut })} label="Cash-out in dollars" />
            </Field>
          )}
        </div>

        {!isLive && (
          <>
            <div className="edit-form-row">
              <Field label="Time played">
                <div className="edit-form-row">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    className="edit-form-input"
                    aria-label="Hours"
                    placeholder="h"
                    value={form.hours}
                    onChange={(e) => set({ hours: e.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="59"
                    className="edit-form-input"
                    aria-label="Minutes"
                    placeholder="min"
                    value={form.minutes}
                    onChange={(e) => set({ minutes: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Hands" htmlFor="session-hands">
                <input
                  id="session-hands"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className="edit-form-input"
                  value={form.hands}
                  onChange={(e) => set({ hands: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Rating">
              <StarRating value={form.rating} onChange={(rating) => set({ rating })} label="Session rating" />
            </Field>
            <Field label="Tilt">
              <TiltMeter value={form.tilt} onChange={(tilt) => set({ tilt })} />
            </Field>
            <Field label="Notes" htmlFor="session-notes">
              <textarea
                id="session-notes"
                className="edit-form-input"
                rows={3}
                value={form.notes}
                placeholder="What went well? What will you work on?"
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Field>
          </>
        )}

        <EditFormFooter
          error={error}
          saving={saving}
          onDelete={handleDelete}
          deleteLabel={isLive ? 'Discard' : 'Delete'}
          confirmText={
            isLive
              ? 'Discard this session? Its timeline is thrown away; hands you saved stay in Hand Review.'
              : 'Delete this session? Hands you saved in it stay in Hand Review.'
          }
        />
      </form>
    </Modal>
  );
}
