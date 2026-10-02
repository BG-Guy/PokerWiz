// Form to start a live session: game, stakes, venue and buy-in, with a felt preview of the table.
import { useState } from 'react';
import { startSession } from '../../api/sessions.js';
import { GAMES, STAKES, VENUES } from '../../constants/poker.js';
import { formatMoney } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './StartSessionForm.css';

const STAKE_OPTIONS = STAKES.map((s) => ({ value: s.label, label: s.label }));
const VENUE_OPTIONS = VENUES.map((v) => ({ value: v, label: v }));
const BUY_IN_DEPTHS = [50, 100, 200]; // quick buy-in buttons, in big blinds

export default function StartSessionForm({ onStarted }) {
  const [game, setGame] = useState('NLH');
  const [stakesLabel, setStakesLabel] = useState('$1/$2');
  const [venue, setVenue] = useState('Casino');
  const [buyIn, setBuyIn] = useState('200');
  const [buyInEdited, setBuyInEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const stakes = STAKES.find((s) => s.label === stakesLabel);
  const amount = Number(buyIn);

  // Changing stakes suggests a 100 big blind buy-in, unless the user typed their own.
  const chooseStakes = (label) => {
    setStakesLabel(label);
    if (!buyInEdited) setBuyIn(String(STAKES.find((s) => s.label === label).bb * 100));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!(amount > 0)) {
      setError('Enter how much you are buying in for.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onStarted(await startSession({ game, stakes: stakes.label, bigBlind: stakes.bb, venue, buyIn: amount }));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="start-session">
      <PageHeader title="Start a session" subtitle="Set the table, then log hands and notes as you play." />

      <div className="start-session-layout">
        <form className="start-session-form" onSubmit={handleSubmit}>
          <fieldset className="start-session-field">
            <legend className="start-session-label">Game</legend>
            <FilterChips options={GAMES} value={game} onChange={setGame} label="Game" />
          </fieldset>

          <fieldset className="start-session-field">
            <legend className="start-session-label">Stakes</legend>
            <FilterChips options={STAKE_OPTIONS} value={stakesLabel} onChange={chooseStakes} label="Stakes" />
          </fieldset>

          <fieldset className="start-session-field">
            <legend className="start-session-label">Where are you playing?</legend>
            <FilterChips options={VENUE_OPTIONS} value={venue} onChange={setVenue} label="Venue" />
          </fieldset>

          {/* Buy-in: free entry plus quick picks in big blinds */}
          <fieldset className="start-session-field">
            <legend className="start-session-label">Buy-in</legend>
            <label className="start-session-money">
              <span aria-hidden="true">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={buyIn}
                aria-label="Buy-in amount in dollars"
                onChange={(event) => {
                  setBuyIn(event.target.value);
                  setBuyInEdited(true);
                }}
              />
            </label>
            <div className="start-session-quick">
              {BUY_IN_DEPTHS.map((depth) => (
                <button key={depth} type="button" className="filter-chip" onClick={() => setBuyIn(String(stakes.bb * depth))}>
                  {depth} bb
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="start-session-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn start-session-submit" disabled={saving}>
            <Icon name="play" size={18} /> {saving ? 'Starting' : 'Start session'}
          </button>
        </form>

        {/* Live preview of the session being set up */}
        <aside className="start-session-preview" aria-hidden="true">
          <span className="start-session-preview-kicker">Your table</span>
          <span className="start-session-preview-game">
            {game} {stakes.label}
          </span>
          <span className="start-session-preview-venue">{venue}</span>
          <span className="start-session-preview-buyin num">{amount > 0 ? formatMoney(amount, { sign: false }) : '$0'}</span>
          <span className="start-session-preview-depth">{amount > 0 ? `${Math.round(amount / stakes.bb)} big blinds` : 'No buy-in yet'}</span>
        </aside>
      </div>
    </div>
  );
}
