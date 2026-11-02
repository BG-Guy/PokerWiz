// Full-screen bankroll chart: the curve as big as the screen allows (phones upright or sideways, desktop), with
// a time range, the x axis by hours / sessions / date, filters (cash or tournaments, game, stakes, venue),
// shaded downswings and peak / low markers, and a summary of whatever is on screen. Escape or Back closes it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { amountFormatters, sessionsForDisplay, todayIso } from '../../utils/format.js';
import { bankrollSeries, filterSessions, rangeSummary, valuesOf } from '../../utils/bankroll.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import FilterChips from '../FilterChips/FilterChips.jsx';
import Icon from '../Icon/Icon.jsx';
import BankrollPlot from '../BankrollChart/BankrollPlot.jsx';
import BankrollSummary from './BankrollSummary.jsx';
import BankrollFilters from './BankrollFilters.jsx';
import './BankrollFullscreen.css';

const CLOSE_MS = 220; // matches the closing animation in BankrollFullscreen.css

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: 'This year' },
  { value: '90', label: '90 days' },
  { value: '30', label: '30 days' },
];
const X_MODES = [
  { value: 'hours', label: 'Hours' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'date', label: 'Date' },
];
const RANGE_WORDS = { all: 'All time', year: 'This year', 90: 'Last 90 days', 30: 'Last 30 days' };
const NO_FILTERS = { format: 'cash', game: 'all', stakes: 'all', venue: 'all' };

// sessions: every finished session as stored (cash and tournaments, in dollars).
export default function BankrollFullscreen({ open, onClose, sessions }) {
  // Stays on the page while it animates away after closing (same pattern as Modal).
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // What's on screen.
  const [range, setRange] = useState('all');
  const [xMode, setXMode] = useState('hours');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [extras, setExtras] = useState({ downswings: true, markers: true });
  const isTouch = useMediaQuery('(pointer: coarse)');

  // While open: Escape closes, the page behind stops scrolling, and focus moves into the view.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && !event.defaultPrevented && onCloseRef.current();
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Closing: leave the page once the closing animation has played (at once if motion is reduced).
  useEffect(() => {
    if (!closing) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setShown(false), reduced ? 0 : CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  // The sessions on screen, the curve and its summary. Tournaments have no big blind, so they're shown in dollars.
  const dollars = filters.format === 'tournament';
  const ofFormat = useMemo(() => sessions.filter((s) => (s.format ?? 'cash') === filters.format), [sessions, filters.format]);
  const visible = useMemo(
    () => sessionsForDisplay(filterSessions(sessions, { ...filters, range }, todayIso())),
    [sessions, filters, range]
  );
  const points = useMemo(() => bankrollSeries(visible), [visible]);
  const summary = useMemo(() => rangeSummary(visible), [visible]);
  const money = amountFormatters({ dollars });
  const hasTournaments = sessions.some((s) => s.format === 'tournament');
  const options = useMemo(
    () => ({ game: valuesOf(ofFormat, 'game'), stakes: valuesOf(ofFormat, 'stakes'), venue: valuesOf(ofFormat, 'venue') }),
    [ofFormat]
  );
  const filtered = Object.keys(NO_FILTERS).some((key) => key !== 'format' && filters[key] !== 'all');

  // A new format has its own games, stakes and venues: start those over.
  const changeFilter = (key, value) =>
    setFilters((current) => (key === 'format' ? { ...NO_FILTERS, format: value } : { ...current, [key]: value }));

  if (!shown) return null;

  const scope = [dollars ? 'Tournaments' : 'Cash games', RANGE_WORDS[range], filters.game !== 'all' && filters.game, filters.stakes !== 'all' && filters.stakes, filters.venue !== 'all' && filters.venue]
    .filter(Boolean)
    .join(' · ');

  return createPortal(
    <div className={`bankroll-fs ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Bankroll chart" aria-hidden={closing || undefined} tabIndex={-1} ref={dialogRef}>
      {/* Title, what's on screen, and the way out */}
      <header className="bankroll-fs-header">
        <div className="bankroll-fs-heading">
          <h2 className="bankroll-fs-title">Bankroll</h2>
          <p className="bankroll-fs-scope">{scope}</p>
        </div>
        <button type="button" className="bankroll-fs-close" onClick={onClose} aria-label="Close full screen">
          <Icon name="shrink" size={18} />
        </button>
      </header>

      <div className="bankroll-fs-body">
        {/* The chart, with the time range and x axis right above it */}
        <section className="bankroll-fs-main">
          <div className="bankroll-fs-toolbar">
            <FilterChips options={RANGES} value={range} onChange={setRange} label="Time range" />
            <div className="bankroll-fs-axis" role="group" aria-label="Measure along the bottom by">
              {X_MODES.map((mode) => (
                <button key={mode.value} type="button" className={mode.value === xMode ? 'is-active' : ''} aria-pressed={mode.value === xMode} onClick={() => setXMode(mode.value)}>
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bankroll-fs-plot">
            {points.length > 1 ? (
              <BankrollPlot points={points} money={money} xMode={xMode} showDownswings={extras.downswings} showMarkers={extras.markers} />
            ) : (
              <div className="bankroll-fs-empty">
                <p>No sessions match these filters.</p>
                {(filtered || range !== 'all') && (
                  <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ ...NO_FILTERS, format: filters.format }); setRange('all'); }}>
                    Show everything
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="bankroll-fs-hint">{isTouch ? 'Tap or drag on the chart to read a session.' : 'Hover the chart, or focus it and use the arrow keys, to read a session.'}</p>
        </section>

        {/* What the curve adds up to, then the filters and extras */}
        <aside className="bankroll-fs-side">
          <BankrollSummary summary={summary} money={money} dollars={dollars} />
          <BankrollFilters
            filters={filters}
            options={options}
            hasTournaments={hasTournaments}
            onChange={changeFilter}
            extras={extras}
            onToggle={(key) => setExtras((current) => ({ ...current, [key]: !current[key] }))}
            onReset={filtered ? () => setFilters({ ...NO_FILTERS, format: filters.format }) : null}
          />
        </aside>
      </div>
    </div>,
    document.body
  );
}
