// Bankroll chart card: the cash-game bankroll curve with a quick time range, and a button that opens the full-
// screen view (BankrollFullscreen) with filters, extras and a summary. The full-screen view lives in the URL
// (?view=bankroll), so the phone's back gesture and the browser's Back button close it.
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cashGames } from '../../utils/stats.js';
import { amountFormatters, sessionsForDisplay, todayIso } from '../../utils/format.js';
import { bankrollSeries, inRange } from '../../utils/bankroll.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import FilterChips from '../FilterChips/FilterChips.jsx';
import Icon from '../Icon/Icon.jsx';
import BankrollFullscreen from '../BankrollFullscreen/BankrollFullscreen.jsx';
import BankrollPlot from './BankrollPlot.jsx';
import './BankrollChart.css';

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: '90', label: '90 days' },
  { value: '30', label: '30 days' },
];

// sessions: every finished session as stored (cash and tournaments, in dollars).
export default function BankrollChart({ sessions }) {
  const [range, setRange] = useState('all');
  const isTouch = useMediaQuery('(pointer: coarse)');
  const narrow = useMediaQuery('(max-width: 519px)');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const expandRef = useRef(null);
  // Opened from this page (so Back returns here), rather than from a link straight to the full-screen view.
  const openedHere = useRef(false);
  const fullscreen = params.get('view') === 'bankroll';

  // The card shows cash games in the BB/$ unit.
  const cash = useMemo(() => sessionsForDisplay(cashGames(sessions)), [sessions]);
  const points = useMemo(() => bankrollSeries(inRange(cash, range, todayIso())), [cash, range]);
  const money = amountFormatters();

  const open = () => {
    openedHere.current = true;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('view', 'bankroll');
      return next;
    });
  };
  // Closing goes back in history when we pushed the entry, so Back doesn't reopen it; focus returns to the button.
  const close = () => {
    if (openedHere.current) navigate(-1);
    else
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('view');
          return next;
        },
        { replace: true }
      );
    openedHere.current = false;
    requestAnimationFrame(() => expandRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div className="bankroll-chart">
      <div className="bankroll-chart-controls">
        <FilterChips options={RANGES} value={range} onChange={setRange} label="Time range" />
        <button type="button" className="bankroll-chart-expand" onClick={open} ref={expandRef} aria-label="Open the bankroll chart full screen">
          <Icon name="expand" size={16} />
          <span>Full screen</span>
        </button>
      </div>

      {points.length > 1 ? (
        <>
          <BankrollPlot points={points} money={money} height={narrow ? 250 : 310} />
          <span className="bankroll-chart-hint">{isTouch ? 'Tap or drag on the chart' : 'Hover the chart'} to read a session</span>
        </>
      ) : (
        <p className="bankroll-chart-empty">No sessions in this range yet.</p>
      )}

      <BankrollFullscreen open={fullscreen} onClose={close} sessions={sessions} />
    </div>
  );
}
