// Bankroll chart card: the bankroll curve with a quick time range, a Filter button (a sheet with game, stakes,
// venue, what runs along the bottom, and what the sessions on the chart add up to) and a Full screen button
// (BankrollFullscreen: just the graph, turned sideways on a phone, a dot for every session). The full-screen
// view lives in the URL (?view=bankroll), so the phone's back gesture and the browser's Back button close it.
// Amounts are in big blinds only when everything on the chart was played at one big blind (moneyScope);
// narrowing it to one stake brings them back.
import { useMemo, useRef, useState } from 'react';
import { moneyScope, todayIso } from '../../utils/format.js';
import { bankrollSeries, filterSessions, inRange, rangeSummary, valuesOf } from '../../utils/bankroll.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useUrlFlag } from '../../hooks/useUrlFlag.js';
import { useUnit } from '../../theme/UnitContext.jsx';
import FilterChips from '../FilterChips/FilterChips.jsx';
import Icon from '../Icon/Icon.jsx';
import Modal from '../Modal/Modal.jsx';
import UnitNote from '../UnitNote/UnitNote.jsx';
import BankrollFullscreen from '../BankrollFullscreen/BankrollFullscreen.jsx';
import BankrollFilters from '../BankrollFullscreen/BankrollFilters.jsx';
import BankrollSummary from '../BankrollFullscreen/BankrollSummary.jsx';
import BankrollPlot from './BankrollPlot.jsx';
import './BankrollChart.css';

// Time ranges, with the short names a phone has room for.
const RANGES = [
  { value: 'all', label: 'All time', short: 'All' },
  { value: '90', label: '90 days', short: '90d' },
  { value: '30', label: '30 days', short: '30d' },
];
const NO_FILTERS = { format: 'cash', game: 'all', stakes: 'all', venue: 'all' };

// sessions: every finished session as stored (cash and tournaments, in dollars).
export default function BankrollChart({ sessions }) {
  const [range, setRange] = useState('all');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [xMode, setXMode] = useState('hours');
  const [extras, setExtras] = useState({ downswings: false, markers: false });
  const [filtering, setFiltering] = useState(false);
  const isTouch = useMediaQuery('(pointer: coarse)');
  const narrow = useMediaQuery('(max-width: 519px)');
  const { unit } = useUnit();
  const fullscreen = useUrlFlag('view', 'bankroll');
  const expandRef = useRef(null);
  const today = todayIso();

  // What's on the chart: the sessions the filters leave, in the unit they can be shown in, then the time range.
  const tournaments = filters.format === 'tournament';
  const scope = useMemo(() => moneyScope(filterSessions(sessions, filters, today)), [sessions, filters, today, unit]);
  const visible = useMemo(() => inRange(scope.sessions, range, today), [scope, range, today]);
  const points = useMemo(() => bankrollSeries(visible), [visible]);
  const summary = useMemo(() => rangeSummary(visible), [visible]);

  // The filter sheet's choices: the games, stakes and venues of the chosen format.
  const ofFormat = useMemo(() => sessions.filter((s) => (s.format ?? 'cash') === filters.format), [sessions, filters.format]);
  const options = useMemo(() => ({ game: valuesOf(ofFormat, 'game'), stakes: valuesOf(ofFormat, 'stakes'), venue: valuesOf(ofFormat, 'venue') }), [ofFormat]);
  const hasTournaments = sessions.some((s) => s.format === 'tournament');
  const picked = ['game', 'stakes', 'venue'].filter((key) => filters[key] !== 'all').map((key) => filters[key]);
  const filtered = picked.length > 0 || tournaments;
  const words = [tournaments ? 'Tournaments' : 'Cash games', ...picked].join(' · ');

  // A new format has its own games, stakes and venues: start those over.
  const changeFilter = (key, value) => setFilters((current) => (key === 'format' ? { ...NO_FILTERS, format: value } : { ...current, [key]: value }));
  // Closing puts focus back on the button that opened it.
  const closeFullscreen = () => {
    fullscreen.close();
    requestAnimationFrame(() => expandRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div className="bankroll-chart">
      <div className="bankroll-chart-controls">
        <FilterChips options={RANGES.map((r) => ({ value: r.value, label: narrow ? r.short : r.label }))} value={range} onChange={setRange} label="Time range" />
        <span className="bankroll-chart-buttons">
          <button type="button" className={`bankroll-chart-button ${filtered ? 'is-on' : ''}`} onClick={() => setFiltering(true)} aria-haspopup="dialog" aria-label={filtered ? `Filter the chart (now: ${words})` : 'Filter the chart'}>
            <Icon name="filter" size={16} />
            <span>Filter</span>
          </button>
          <button type="button" className="bankroll-chart-button" onClick={fullscreen.open} ref={expandRef} aria-label="Open the bankroll chart full screen">
            <Icon name="expand" size={16} />
            <span>Full screen</span>
          </button>
        </span>
      </div>

      {/* What the chart is narrowed to, with the way back to everything */}
      {filtered && (
        <p className="bankroll-chart-scope">
          <span>{words}</span>
          <button type="button" className="btn-link" onClick={() => setFilters(NO_FILTERS)}>
            Show all
          </button>
        </p>
      )}

      {points.length > 1 ? (
        <>
          <BankrollPlot points={points} money={scope.money} xMode={xMode} height={narrow ? 250 : 310} showDownswings={extras.downswings} showMarkers={extras.markers} />
          <span className="bankroll-chart-hint">{isTouch ? 'Tap or drag on the chart' : 'Hover the chart'} to read a session. Full screen for every dot.</span>
        </>
      ) : (
        <p className="bankroll-chart-empty">No sessions here yet.</p>
      )}
      <UnitNote scope={scope} tip="Filter to one stake to see big blinds." />

      {/* Filter sheet: what's on the chart, and what it adds up to */}
      <Modal open={filtering} onClose={() => setFiltering(false)} title="Filter the chart" className="bankroll-chart-sheet">
        <BankrollFilters
          filters={filters}
          options={options}
          hasTournaments={hasTournaments}
          onChange={changeFilter}
          extras={extras}
          onToggle={(key) => setExtras((current) => ({ ...current, [key]: !current[key] }))}
          onReset={picked.length > 0 ? () => setFilters({ ...NO_FILTERS, format: filters.format }) : null}
          xMode={xMode}
          onXMode={setXMode}
        />
        <h3 className="bankroll-chart-sheet-title">
          On the chart <span>{[words, RANGES.find((r) => r.value === range).label].join(' · ')}</span>
        </h3>
        {visible.length > 0 ? <BankrollSummary summary={summary} money={scope.money} dollars={tournaments} /> : <p className="bankroll-chart-empty">No sessions match.</p>}
        <UnitNote scope={scope} />
        <button type="button" className="btn bankroll-chart-sheet-done" onClick={() => setFiltering(false)}>
          Show {visible.length} {visible.length === 1 ? 'session' : 'sessions'}
        </button>
      </Modal>

      <BankrollFullscreen
        open={fullscreen.on}
        onClose={closeFullscreen}
        sessions={scope.sessions}
        money={scope.money}
        scope={words}
        xMode={xMode}
        showDownswings={extras.downswings}
        showMarkers={extras.markers}
        initialRange={range}
      />
    </div>
  );
}
