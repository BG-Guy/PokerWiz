// Full-screen bankroll graph: just the curve, as big as the screen, with a dot for every session. Tap a dot (or
// drag along the curve) for that session's story and the way to it. A phone held upright shows the graph on its
// side, so turning the phone gives it the long edge; a phone already on its side, a tablet or a desktop shows it
// straight. The slim bar on top has the way out and the time range. Escape or Back closes it, and it can open
// over a sheet (the Net profit sheet's curve).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { plural, todayIso } from '../../utils/format.js';
import { bankrollSeries, inRange } from '../../utils/bankroll.js';
import { useDialogLayer } from '../../hooks/useDialogLayer.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import FilterChips from '../FilterChips/FilterChips.jsx';
import Icon from '../Icon/Icon.jsx';
import BankrollPlot from '../BankrollChart/BankrollPlot.jsx';
import './BankrollFullscreen.css';

const CLOSE_MS = 200; // matches the closing animation in BankrollFullscreen.css

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: 'This year' },
  { value: '90', label: '90 days' },
  { value: '30', label: '30 days' },
];
// The same query as the stylesheet's: an upright phone, where the stage is turned a quarter.
const UPRIGHT_PHONE = '(orientation: portrait) and (max-width: 639px)';

// sessions: the ones on the chart, in the unit they're shown in (moneyScope().sessions). money: the formatters
// for that unit. scope: a few words about what's on it ("Cash games · $1/$3"). initialRange: the time range
// it opens on.
export default function BankrollFullscreen({ open, onClose, sessions, money, title = 'Bankroll', scope = '', xMode = 'hours', showDownswings = false, showMarkers = true, initialRange = 'all' }) {
  // Stays on the page while it animates away after closing (the same pattern as Modal).
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;
  const viewRef = useRef(null);
  const [range, setRange] = useState(initialRange);
  const rotated = useMediaQuery(UPRIGHT_PHONE);

  // While open: Escape closes this layer only, the page behind stops scrolling, focus moves in.
  useDialogLayer(open, onClose, viewRef);

  // Opening again starts from the range it was asked for.
  useEffect(() => {
    if (open) setRange(initialRange);
  }, [open, initialRange]);

  // Closing: leave the page once the closing animation has played (at once if motion is reduced).
  useEffect(() => {
    if (!closing) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setShown(false), reduced ? 0 : CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  const points = useMemo(() => bankrollSeries(inRange(sessions, range, todayIso())), [sessions, range]);

  if (!shown) return null;

  const count = points.length - 1;
  const words = [scope, plural(count, 'session'), money.unit === 'bb' ? 'in big blinds' : 'in dollars'].filter(Boolean).join(' · ');

  return createPortal(
    <div className={`bankroll-fs ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={`${title} chart, full screen`} aria-hidden={closing || undefined} tabIndex={-1} ref={viewRef}>
      {/* The stage: the whole screen, turned on its side on an upright phone */}
      <div className="bankroll-fs-stage">
        <header className="bankroll-fs-bar">
          <button type="button" className="bankroll-fs-close" onClick={onClose} aria-label="Close full screen">
            <Icon name="close" size={18} />
          </button>
          <div className="bankroll-fs-heading">
            <h2 className="bankroll-fs-title">{title}</h2>
            <p className="bankroll-fs-scope">{words}</p>
          </div>
          <FilterChips options={RANGES} value={range} onChange={setRange} label="Time range" />
        </header>

        <div className="bankroll-fs-plot">
          {count > 0 ? (
            <BankrollPlot points={points} money={money} xMode={xMode} showDownswings={showDownswings} showMarkers={showMarkers} detailed rotated={rotated} />
          ) : (
            <div className="bankroll-fs-empty">
              <p>No sessions in this range.</p>
              {range !== 'all' && (
                <button type="button" className="btn btn-ghost" onClick={() => setRange('all')}>
                  Show all time
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upright phone: a nudge to turn it, written the way the phone is held now */}
      {rotated && (
        <p className="bankroll-fs-turn" aria-hidden="true">
          <Icon name="repeat" size={16} /> Turn your phone
        </p>
      )}
    </div>,
    document.body
  );
}
