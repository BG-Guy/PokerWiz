// Edit a finished session: when and where, the game and stakes, how long, the money, how it felt, and notes.
// "Delete session" removes it from your history; hands saved from it stay in your hands list.
// Amounts here are always dollars (the raw session, not the BB display copy).
import { useState } from 'react';
import { updateSession, deleteSession } from '../../api/sessions.js';
import { GAMES, STAKES, VENUES } from '../../constants/poker.js';
import { bigBlindOf } from '../../utils/format.js';
import { isTournament } from '../../utils/stats.js';
import Modal from '../../components/Modal/Modal.jsx';
import FormField from '../../components/FormField/FormField.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import StarRating from '../../components/StarRating/StarRating.jsx';
import TiltMeter from '../../components/TiltMeter/TiltMeter.jsx';
import Money from '../../components/Money/Money.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './EditSessionSheet.css';

const toNumber = (text) => (text === '' ? NaN : Number(text));

// onSaved(session) with the saved copy; onDeleted() once it's gone.
export default function EditSessionSheet({ session, handCount, open, onClose, onSaved, onDeleted }) {
  const tournament = isTournament(session);
  const [date, setDate] = useState(session.date);
  const [venue, setVenue] = useState(session.venue);
  const [game, setGame] = useState(session.game);
  const [stakes, setStakes] = useState(session.stakes);
  const [hours, setHours] = useState(String(Math.floor(session.durationMin / 60)));
  const [minutes, setMinutes] = useState(String(session.durationMin % 60));
  const [hands, setHands] = useState(String(session.hands));
  const [buyIn, setBuyIn] = useState(String(session.buyIn));
  const [cashOut, setCashOut] = useState(String(session.cashOut));
  const [expenses, setExpenses] = useState(String(session.expenses ?? 0));
  const [rating, setRating] = useState(session.rating ?? 0);
  const [tilt, setTilt] = useState(session.tilt ?? null);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Games to pick from, keeping this session's own if the list doesn't have it.
  const gameOptions = GAMES.some((g) => g.value === session.game) ? GAMES : [{ value: session.game, label: session.game }, ...GAMES];
  const net = toNumber(cashOut) - toNumber(buyIn) - (toNumber(expenses) || 0);
  // The big blind follows the stakes ("$2/$5" -> 5); tournaments keep theirs (none).
  const bigBlind = tournament ? session.bigBlind : (bigBlindOf(stakes) ?? session.bigBlind);

  // Check the numbers, then send only what changed.
  const save = async (event) => {
    event.preventDefault();
    const durationMin = Math.round((toNumber(hours) || 0) * 60 + (toNumber(minutes) || 0));
    const money = { buyIn: toNumber(buyIn), cashOut: toNumber(cashOut), expenses: toNumber(expenses) || 0 };
    if (Object.values(money).some((value) => !(value >= 0))) return setError('Enter amounts of zero or more.');
    if (!(durationMin > 0)) return setError('Enter how long you played.');
    if (!Number.isInteger(toNumber(hands)) || toNumber(hands) < 0) return setError('Hands played must be a whole number.');
    if (!venue.trim() || !stakes.trim()) return setError(`Fill in the venue and the ${tournament ? 'event' : 'stakes'}.`);

    const next = {
      date,
      venue: venue.trim(),
      game,
      stakes: stakes.trim(),
      bigBlind,
      durationMin,
      hands: toNumber(hands),
      ...money,
      rating: rating > 0 ? rating : null, // 0 stars means "not rated"
      tilt,
      notes: notes.trim(),
    };
    const before = { ...session, rating: session.rating ?? null, tilt: session.tilt ?? null, notes: session.notes ?? '' };
    const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== before[key]));
    if (!Object.keys(changes).length) return onClose();
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateSession(session.id, changes));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Edit session" className="edit-session-sheet">
        <form className="edit-session-form" onSubmit={save}>
          {/* When and where */}
          <div className="form-grid">
            <FormField label="Date" htmlFor="edit-session-date">
              <input id="edit-session-date" type="date" className="form-input" value={date} onChange={(event) => setDate(event.target.value)} />
            </FormField>
            <FormField label="Venue" htmlFor="edit-session-venue">
              <input
                id="edit-session-venue"
                className="form-input"
                list="edit-session-venues"
                maxLength={80}
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
              />
              <datalist id="edit-session-venues">
                {VENUES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </FormField>
          </div>

          {/* The game: stakes for cash games (the big blind follows them), the event name for tournaments */}
          <div className="form-grid">
            <FormField label="Game" htmlFor="edit-session-game">
              <select id="edit-session-game" className="form-input" value={game} onChange={(event) => setGame(event.target.value)}>
                {gameOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label={tournament ? 'Event' : 'Stakes'}
              htmlFor="edit-session-stakes"
              hint={!tournament && bigBlind ? `Big blind $${bigBlind}` : undefined}
            >
              <input
                id="edit-session-stakes"
                className="form-input"
                list={tournament ? undefined : 'edit-session-stakes-list'}
                maxLength={80}
                value={stakes}
                onChange={(event) => setStakes(event.target.value)}
              />
              <datalist id="edit-session-stakes-list">
                {STAKES.map((option) => (
                  <option key={option.label} value={option.label} />
                ))}
              </datalist>
            </FormField>
          </div>

          {/* How long, and how many hands */}
          <div className="form-grid">
            <FormField label="Length" htmlFor="edit-session-hours">
              <span className="edit-session-length">
                <span className="form-money">
                  <input
                    id="edit-session-hours"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="72"
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                    aria-label="Hours"
                  />
                  h
                </span>
                <span className="form-money">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={(event) => setMinutes(event.target.value)}
                    aria-label="Minutes"
                  />
                  m
                </span>
              </span>
            </FormField>
            <FormField label="Hands played" htmlFor="edit-session-hands">
              <input
                id="edit-session-hands"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="form-input"
                value={hands}
                onChange={(event) => setHands(event.target.value)}
              />
            </FormField>
          </div>

          {/* The money, with the net result as you type */}
          <div className="edit-session-money">
            {[
              ['Buy-in', 'edit-session-buy-in', buyIn, setBuyIn],
              ['Cash-out', 'edit-session-cash-out', cashOut, setCashOut],
              ['Expenses', 'edit-session-expenses', expenses, setExpenses],
            ].map(([label, id, value, setValue]) => (
              <FormField key={id} label={label} htmlFor={id}>
                <span className="form-money">
                  $
                  <input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(event) => setValue(event.target.value)} />
                </span>
              </FormField>
            ))}
          </div>
          {Number.isFinite(net) && (
            <p className="edit-session-net">
              Net result <Money amount={net} bb={tournament ? null : bigBlind} />
            </p>
          )}

          {/* How it felt */}
          <FormField label="Rating">
            <span className="edit-session-inline">
              <StarRating value={rating} onChange={setRating} label="Session rating" />
              {rating > 0 && (
                <button type="button" className="btn-link" onClick={() => setRating(0)}>
                  Clear
                </button>
              )}
            </span>
          </FormField>
          <FormField label="Tilt">
            <TiltMeter value={tilt} onChange={setTilt} />
            {tilt != null && (
              <button type="button" className="btn-link edit-session-clear" onClick={() => setTilt(null)}>
                Clear tilt
              </button>
            )}
          </FormField>

          <FormField label="Notes" htmlFor="edit-session-notes">
            <textarea
              id="edit-session-notes"
              className="form-input"
              rows={3}
              placeholder="What went well? What will you work on?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </FormField>

          {error && (
            <p className="edit-session-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn edit-session-save" disabled={saving}>
            <Icon name="check" size={16} /> {saving ? 'Saving' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-danger-ghost edit-session-delete" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Delete session
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this session?"
        message={`It will be removed from your history, totals and charts.${
          handCount ? ` Its ${handCount} saved ${handCount === 1 ? 'hand stays' : 'hands stay'} in your hands list.` : ''
        } This can't be undone.`}
        confirmLabel="Delete session"
        onConfirm={async () => {
          await deleteSession(session.id);
          setConfirmDelete(false);
          onClose();
          onDeleted();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
