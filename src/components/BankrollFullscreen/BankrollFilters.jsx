// Filters and extras for the full-screen chart: cash or tournaments (when you've played both), game, stakes and
// venue, plus switches for shaded downswings and peak / low markers.
import FilterChips from '../FilterChips/FilterChips.jsx';
import ToggleChip from '../ToggleChip/ToggleChip.jsx';
import './BankrollFilters.css';

const FORMATS = [
  { value: 'cash', label: 'Cash' },
  { value: 'tournament', label: 'Tournaments' },
];

// options: { game, stakes, venue } as valuesOf() lists. onReset: clears game, stakes and venue (null when clear).
export default function BankrollFilters({ filters, options, hasTournaments, onChange, extras, onToggle, onReset }) {
  const withAll = (list) => [{ value: 'all', label: 'All' }, ...list.map(({ value }) => ({ value, label: value }))];

  return (
    <section className="bankroll-filters" aria-label="Filters">
      <div className="bankroll-filters-top">
        <h3 className="bankroll-filters-title">Filters</h3>
        {onReset && (
          <button type="button" className="btn-link" onClick={onReset}>
            Clear
          </button>
        )}
      </div>

      {/* Cash and tournaments are never mixed: one counts big blinds, the other dollars */}
      {hasTournaments && (
        <div className="bankroll-filters-row">
          <span className="bankroll-filters-label">Format</span>
          <FilterChips options={FORMATS} value={filters.format} onChange={(value) => onChange('format', value)} label="Format" />
        </div>
      )}

      {options.game.length > 1 && (
        <div className="bankroll-filters-row">
          <span className="bankroll-filters-label">Game</span>
          <FilterChips options={withAll(options.game)} value={filters.game} onChange={(value) => onChange('game', value)} label="Game" />
        </div>
      )}

      {/* Stakes and venues can be long lists: a picker each, side by side */}
      <div className="bankroll-filters-selects">
        {[
          ['stakes', 'Stakes', 'All stakes'],
          ['venue', 'Venue', 'All venues'],
        ].map(([key, label, allLabel]) =>
          options[key].length > 1 ? (
            <label key={key} className="bankroll-filters-select">
              <span className="bankroll-filters-label">{label}</span>
              <select value={filters[key]} onChange={(event) => onChange(key, event.target.value)}>
                <option value="all">{allLabel}</option>
                {options[key].map(({ value, count }) => (
                  <option key={value} value={value}>
                    {value} ({count})
                  </option>
                ))}
              </select>
            </label>
          ) : null
        )}
      </div>

      {/* Extras drawn on the chart */}
      <div className="bankroll-filters-row">
        <span className="bankroll-filters-label">On the chart</span>
        <div className="bankroll-filters-toggles">
          <ToggleChip label="Downswings" on={extras.downswings} onToggle={() => onToggle('downswings')} />
          <ToggleChip label="Peak and low" on={extras.markers} onToggle={() => onToggle('markers')} />
        </div>
      </div>
    </section>
  );
}
