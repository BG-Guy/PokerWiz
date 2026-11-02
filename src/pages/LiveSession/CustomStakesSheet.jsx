// Custom stakes sheet (slides up from the bottom on phones): blinds the stakes buttons don't have, an optional
// ante and straddle, the game, and the table (seats and its name). Also lists the custom stakes you've saved,
// to pick one again or remove it.
import { useState } from 'react';
import { GAMES } from '../../constants/poker.js';
import { stakesLabel, stakeDetails } from '../../utils/stakes.js';
import Modal from '../../components/Modal/Modal.jsx';
import FormField from '../../components/FormField/FormField.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './CustomStakesSheet.css';

// Seat counts to pick from (tap the picked one again to leave it out).
const TABLE_SIZES = [
  { value: 2, label: 'Heads-up' },
  { value: 6, label: '6-max' },
  { value: 8, label: '8' },
  { value: 9, label: '9' },
  { value: 10, label: '10' },
];

// Field text for an amount ('' when there isn't one).
const fieldOf = (value) => (value > 0 ? String(value) : '');
// A typed amount: a number, null when left empty, NaN when unreadable.
const amountOf = (text) => (text.trim() === '' ? null : Number(text));

// One dollar field (small blind, big blind, ante, straddle).
function MoneyField({ id, label, hint, value, onChange, placeholder }) {
  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <span className="form-money">
        $
        <input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </span>
    </FormField>
  );
}

// start: the stake to begin from (the one picked on the form). game: the form's game. saved: your custom stakes.
// onUse(stake) with the new stake; onRemove(stake) takes one off the saved list.
export default function CustomStakesSheet({ open, onClose, start, game: formGame, saved, onUse, onRemove }) {
  const [game, setGame] = useState(start?.game ?? formGame);
  const [sb, setSb] = useState(fieldOf(start?.sb));
  const [bb, setBb] = useState(fieldOf(start?.bb));
  const [ante, setAnte] = useState(fieldOf(start?.ante));
  const [straddle, setStraddle] = useState(fieldOf(start?.straddle));
  const [tableSize, setTableSize] = useState(start?.tableSize ?? null);
  const [tableName, setTableName] = useState(start?.tableName ?? '');
  const [error, setError] = useState(null);

  // The stake as typed so far, for the preview and for saving.
  const amounts = { sb: amountOf(sb), bb: amountOf(bb), ante: amountOf(ante), straddle: amountOf(straddle) };
  const ready = amounts.bb > 0;
  const stake = {
    label: ready ? stakesLabel(amounts) : '',
    sb: amounts.sb || null,
    bb: amounts.bb,
    ante: amounts.ante || null,
    straddle: amounts.straddle || null,
    game,
    tableSize,
    tableName: tableName.trim() || null,
  };

  // Check the numbers, then hand the stake back.
  const submit = (event) => {
    event.preventDefault();
    if (!(amounts.bb > 0)) return setError('Enter the big blind.');
    if (Object.values(amounts).some((v) => v !== null && !(v >= 0))) return setError('Amounts must be zero or more.');
    if (amounts.sb > amounts.bb) return setError("The small blind can't be bigger than the big blind.");
    if (amounts.straddle && amounts.straddle <= amounts.bb) return setError('A straddle is bigger than the big blind (usually twice it).');
    setError(null);
    onUse(stake);
  };

  return (
    <Modal open={open} onClose={onClose} title="Custom stakes" className="custom-stakes-sheet">
      <form className="custom-stakes-form" onSubmit={submit} noValidate>
        {/* What the table will read as, updating while you type */}
        <div className={`custom-stakes-preview ${ready ? 'is-ready' : ''}`} aria-live="polite">
          <span className="custom-stakes-preview-game">{GAMES.find((g) => g.value === game)?.label}</span>
          <span className="custom-stakes-preview-label num">{ready ? stake.label : '$ / $'}</span>
          <span className="custom-stakes-preview-details">{(ready && stakeDetails(stake, { withStraddle: true })) || 'Blinds, ante, straddle and table'}</span>
        </div>

        <FormField label="Game">
          <FilterChips options={GAMES} value={game} onChange={setGame} label="Game" />
        </FormField>

        {/* Blinds, then the optional extras */}
        <div className="form-grid">
          <MoneyField id="custom-sb" label="Small blind" value={sb} onChange={setSb} placeholder="2" />
          <MoneyField id="custom-bb" label="Big blind" value={bb} onChange={setBb} placeholder="5" />
          <MoneyField id="custom-ante" label="Ante" hint="Optional" value={ante} onChange={setAnte} placeholder="None" />
          <MoneyField id="custom-straddle" label="Straddle" hint="Optional" value={straddle} onChange={setStraddle} placeholder="None" />
        </div>

        {/* The table: how many seats, and its name */}
        <FormField label="Players at the table" hint="Optional. Tap again to leave it out.">
          <div className="filter-chips custom-stakes-seats" role="group" aria-label="Players at the table">
            {TABLE_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                className={`filter-chip ${tableSize === size.value ? 'is-active' : ''}`}
                aria-pressed={tableSize === size.value}
                onClick={() => setTableSize(tableSize === size.value ? null : size.value)}
              >
                {size.label}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Table or game name" htmlFor="custom-table-name" hint="Optional, like the table number or a home game's name.">
          <input
            id="custom-table-name"
            className="form-input"
            type="text"
            maxLength={60}
            value={tableName}
            placeholder="Table 12, Friday home game"
            onChange={(event) => setTableName(event.target.value)}
          />
        </FormField>

        {error && (
          <p className="custom-stakes-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn custom-stakes-use">
          <Icon name="check" size={16} /> Use these stakes
        </button>
      </form>

      {/* Custom stakes you've played: pick one again, or take it off the list */}
      {saved.length > 0 && (
        <section className="custom-stakes-saved">
          <h3 className="custom-stakes-saved-title">Your custom stakes</h3>
          <ul className="custom-stakes-saved-list">
            {saved.map((s) => (
              <li key={`${s.label}-${s.tableName}-${s.tableSize}-${s.ante}-${s.game}`} className="custom-stakes-saved-row">
                <button type="button" className="custom-stakes-saved-pick" onClick={() => onUse(s)}>
                  <span className="custom-stakes-saved-label num">{s.label}</span>
                  <span className="custom-stakes-saved-details">{[s.game, stakeDetails(s)].filter(Boolean).join(' · ')}</span>
                </button>
                <button type="button" className="btn-icon" aria-label={`Remove ${s.label}`} onClick={() => onRemove(s)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
