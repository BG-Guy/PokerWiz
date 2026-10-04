// Edit a running session's setup: the game, stakes, venue, and what you sat down with (rebuys stay on top).
import { useState } from 'react';
import { updateSession } from '../../api/sessions.js';
import { GAMES, STAKES, VENUES } from '../../constants/poker.js';
import { bigBlindOf, formatMoney } from '../../utils/format.js';
import Modal from '../../components/Modal/Modal.jsx';
import FormField from '../../components/FormField/FormField.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './EditLiveSessionSheet.css';

// Chip options from a list, with the session's own value first if the list doesn't have it.
const withCurrent = (options, current) => (options.some((o) => o.value === current) ? options : [{ value: current, label: current }, ...options]);

// onSaved(session) with the saved copy.
export default function EditLiveSessionSheet({ session, open, onClose, onSaved }) {
  const rebuys = session.events.filter((e) => e.type === 'rebuy').reduce((sum, e) => sum + e.amount, 0);
  const startBuyIn = session.buyIn - rebuys;
  const [game, setGame] = useState(session.game);
  const [stakes, setStakes] = useState(session.stakes);
  const [venue, setVenue] = useState(session.venue);
  const [buyIn, setBuyIn] = useState(String(startBuyIn));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const stakeOptions = withCurrent(STAKES.map((s) => ({ value: s.label, label: s.label })), session.stakes);
  const venueOptions = withCurrent(VENUES.map((v) => ({ value: v, label: v })), session.venue);
  const bigBlind = STAKES.find((s) => s.label === stakes)?.bb ?? bigBlindOf(stakes) ?? session.bigBlind;
  const amount = buyIn === '' ? NaN : Number(buyIn);

  // Send only what changed.
  const save = async (event) => {
    event.preventDefault();
    if (!(amount > 0)) return setError('Enter what you sat down with.');
    const changes = {};
    if (game !== session.game) changes.game = game;
    if (stakes !== session.stakes) Object.assign(changes, { stakes, bigBlind });
    if (venue !== session.venue) changes.venue = venue;
    if (amount !== startBuyIn) changes.startBuyIn = amount;
    if (!Object.keys(changes).length) return onClose();
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateSession(session.id, changes));
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit session" className="edit-live-sheet">
      <form className="edit-live-form" onSubmit={save}>
        <FormField label="Game">
          <FilterChips options={withCurrent(GAMES, session.game)} value={game} onChange={setGame} label="Game" />
        </FormField>
        <FormField label="Stakes">
          <FilterChips options={stakeOptions} value={stakes} onChange={setStakes} label="Stakes" />
        </FormField>
        <FormField label="Venue">
          <FilterChips options={venueOptions} value={venue} onChange={setVenue} label="Venue" />
        </FormField>

        <FormField
          label="Sat down with"
          htmlFor="edit-live-buy-in"
          hint={rebuys > 0 ? `Plus ${formatMoney(rebuys, { sign: false })} in rebuys on the timeline` : 'Rebuys are added on top, from the timeline'}
        >
          <span className="form-money">
            $
            <input id="edit-live-buy-in" type="number" inputMode="decimal" min="0" step="any" value={buyIn} onChange={(event) => setBuyIn(event.target.value)} />
            {amount > 0 && bigBlind > 0 && <span className="edit-live-depth num">{Math.round(amount / bigBlind)} bb</span>}
          </span>
        </FormField>

        {error && (
          <p className="edit-live-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn edit-live-save" disabled={saving}>
          <Icon name="check" size={16} /> {saving ? 'Saving' : 'Save changes'}
        </button>
      </form>
    </Modal>
  );
}
