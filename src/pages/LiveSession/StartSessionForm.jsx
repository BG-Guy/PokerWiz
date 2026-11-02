// Form to start a live session: game, stakes (the common ones, your custom ones, or new custom stakes from a
// sheet), venue and buy-in, with a felt preview of the table. Your profile picks the starting game, stakes and
// buy-in depth.
import { useEffect, useState } from 'react';
import { startSession } from '../../api/sessions.js';
import { getSettings, updateSettings } from '../../api/settings.js';
import { GAMES, STAKES, VENUES } from '../../constants/poker.js';
import { formatMoney } from '../../utils/format.js';
import { rememberStake, sameStake, stakeDetails } from '../../utils/stakes.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import StakesPicker from './StakesPicker.jsx';
import CustomStakesSheet from './CustomStakesSheet.jsx';
import './StartSessionForm.css';

const VENUE_OPTIONS = VENUES.map((v) => ({ value: v, label: v }));
const BUY_IN_DEPTHS = [50, 100, 200]; // quick buy-in buttons, in big blinds
const DEFAULT_STAKE = { label: '$1/$2', sb: 1, bb: 2 };

export default function StartSessionForm({ onStarted }) {
  const [game, setGame] = useState('NLH');
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [venue, setVenue] = useState('Casino');
  const [buyIn, setBuyIn] = useState('200');
  const [buyInEdited, setBuyInEdited] = useState(false);
  const [depth, setDepth] = useState(100); // suggested buy-in, in big blinds (from your settings)
  const [saved, setSaved] = useState([]); // your custom stakes, newest first
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const amount = Number(buyIn);

  // Picking stakes suggests a buy-in of your usual depth, unless you typed your own.
  const chooseStake = (next, suggestedDepth = depth) => {
    setStake(next);
    if (next.custom && next.game) setGame(next.game);
    if (!buyInEdited) setBuyIn(String(Math.round(next.bb * suggestedDepth * 100) / 100));
  };

  // Your settings: saved custom stakes, buy-in depth, and your usual game and stakes to start from.
  useEffect(() => {
    let active = true;
    getSettings()
      .then((settings) => {
        if (!active) return;
        setSaved(settings.customStakes);
        setDepth(settings.buyInDepth);
        if (settings.favoriteGame) setGame(settings.favoriteGame);
        const usualPreset = STAKES.find((s) => s.label === settings.usualStakes);
        const usualCustom = settings.customStakes.find((s) => s.label === settings.usualStakes);
        const usual = usualPreset ? { label: usualPreset.label, sb: usualPreset.sb, bb: usualPreset.bb } : usualCustom && { ...usualCustom, custom: true };
        chooseStake(usual ?? DEFAULT_STAKE, settings.buyInDepth);
      })
      .catch(() => {}); // without settings the form keeps its defaults
    return () => {
      active = false;
    };
    // Runs once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the custom stakes list in your settings (best effort: the session starts either way).
  const saveList = (list) => {
    setSaved(list);
    updateSettings({ customStakes: list }).catch(() => {});
  };

  // From the sheet: use the stake now, and remember it for next time.
  const pickCustom = (next) => {
    const isPreset = STAKES.some((s) => s.label === next.label && s.sb === next.sb) && !next.ante && !next.tableSize && !next.tableName;
    chooseStake(isPreset ? { label: next.label, sb: next.sb, bb: next.bb } : { ...next, custom: true });
    if (next.game) setGame(next.game);
    if (!isPreset) saveList(rememberStake(saved, next));
    setSheet((current) => ({ ...current, open: false }));
  };
  const removeCustom = (gone) => {
    saveList(saved.filter((s) => !sameStake(s, gone)));
    if (stake.custom && sameStake(stake, gone)) chooseStake(DEFAULT_STAKE);
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
      onStarted(
        await startSession({
          game,
          stakes: stake.label,
          bigBlind: stake.bb,
          smallBlind: stake.sb ?? null,
          ante: stake.ante ?? null,
          straddle: stake.straddle ?? null,
          tableSize: stake.tableSize ?? null,
          tableName: stake.tableName ?? null,
          venue,
          buyIn: amount,
        })
      );
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="start-session">
      <PageHeader title="Start a session" subtitle="Set the table, then log hands, notes and rebuys as you play." />

      <div className="start-session-layout">
        <form className="start-session-form" onSubmit={handleSubmit}>
          <fieldset className="start-session-field">
            <legend className="start-session-label">Game</legend>
            <FilterChips options={GAMES} value={game} onChange={setGame} label="Game" />
          </fieldset>

          <fieldset className="start-session-field">
            <legend className="start-session-label">Stakes</legend>
            <StakesPicker value={stake} saved={saved} onChange={(next) => chooseStake(next)} onCustom={() => setSheet((current) => ({ open: true, key: current.key + 1 }))} />
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
              {BUY_IN_DEPTHS.map((size) => (
                <button key={size} type="button" className="filter-chip" onClick={() => setBuyIn(String(Math.round(stake.bb * size * 100) / 100))}>
                  {size} bb
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
            {game} {stake.label}
          </span>
          <span className="start-session-preview-venue">{[venue, stakeDetails(stake)].filter(Boolean).join(' · ')}</span>
          <span className="start-session-preview-buyin num">{amount > 0 ? formatMoney(amount, { sign: false }) : '$0'}</span>
          <span className="start-session-preview-depth">{amount > 0 ? `${Math.round(amount / stake.bb)} big blinds` : 'No buy-in yet'}</span>
        </aside>
      </div>

      {/* New custom stakes, starting from the ones picked now */}
      <CustomStakesSheet
        key={sheet.key}
        open={sheet.open}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
        start={stake}
        game={game}
        saved={saved}
        onUse={pickCustom}
        onRemove={removeCustom}
      />
    </div>
  );
}
