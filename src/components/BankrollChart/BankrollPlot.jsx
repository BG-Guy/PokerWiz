// The bankroll curve itself: labelled axes, gridlines, a zero line and a dot per session, against hours played,
// session count or the calendar. Optional extras: shaded downswings and peak / low markers. Hover (mouse),
// tap or drag (touch), or the arrow keys read a point: a crosshair, axis badges and a details card.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '../../utils/format.js';
import { sessionProfit } from '../../utils/stats.js';
import { downswings } from '../../utils/bankroll.js';
import './BankrollPlot.css';

const MARGIN = { top: 30, right: 18, bottom: 40, left: 62 };
const DAY = 86400000;
const AXIS_TITLES = { hours: 'Hours played', sessions: 'Sessions', date: 'Date' };
// Above this many sessions the dots turn into clutter; the line says enough.
const MAX_DOTS = 160;

// "Nice" tick step (1, 2, 2.5, 5 x 10^n) for a range split into about `count` parts.
function niceStep(range, count) {
  const raw = range / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function niceTicks(min, max, count) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceStep(max - min, count);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

// Calendar ticks: the first of each month (thinned out to fit), or every few days for short spans.
function dateTicks(minDay, maxDay, count) {
  const span = maxDay - minDay;
  if (span <= 45) {
    const step = Math.max(1, Math.ceil(span / Math.max(1, count)));
    const ticks = [];
    for (let d = minDay; d <= maxDay; d += step) ticks.push(d);
    return { ticks, label: (d) => formatDate(isoOfDay(d)) };
  }
  const months = [];
  const cursor = new Date(minDay * DAY);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() / DAY <= maxDay) {
    months.push(Math.round(cursor.getTime() / DAY));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const every = Math.max(1, Math.ceil(months.length / Math.max(1, count)));
  const long = span > 330;
  return {
    ticks: months.filter((_, i) => i % every === 0),
    label: (d) =>
      new Date(d * DAY).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', ...(long ? { year: '2-digit' } : {}) }),
  };
}
// Calendar days counted in UTC, so a day is always exactly one step whatever the time zone.
const dayOf = (iso) => Date.UTC(...iso.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) / DAY;
const isoOfDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);
const hoursLabel = (h) => `${Math.round(h * 10) / 10}h`;

// Size of the chart's container, kept in sync as the layout (or the phone's orientation) changes.
function useSize(ref) {
  const [size, setSize] = useState({ width: 640, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: Math.max(260, entry.contentRect.width), height: entry.contentRect.height })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// points: bankrollSeries(). money: amountFormatters(). height: fixed pixels, or omitted to fill the container.
export default function BankrollPlot({ points, money, xMode = 'hours', height: fixedHeight, showDownswings = false, showMarkers = false }) {
  const wrapRef = useRef(null);
  const size = useSize(wrapRef);
  const width = size.width;
  const height = fixedHeight ?? Math.max(200, size.height);
  const [activeIndex, setActiveIndex] = useState(null);
  const compactX = width < 520;

  // Where each point sits along the x axis, in the chosen unit.
  const xValue = useMemo(() => {
    if (xMode === 'sessions') return (p) => p.index;
    if (xMode === 'date') return (p) => (p.date ? dayOf(p.date) : 0);
    return (p) => p.hours;
  }, [xMode]);

  // Scales.
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const values = points.map((p) => p.bankroll);
  const yTicks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), height > 400 ? 6 : 4);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const xFirst = xValue(points[0]);
  const xLast = Math.max(xValue(points[points.length - 1]), xFirst + 1);
  const tickCount = compactX ? 4 : 7;
  const xAxis =
    xMode === 'date'
      ? { ...dateTicks(xFirst, xLast, tickCount), min: xFirst, max: xLast }
      : (() => {
          const ticks = niceTicks(0, xLast, tickCount);
          return { ticks, min: 0, max: ticks[ticks.length - 1], label: xMode === 'hours' ? hoursLabel : (v) => String(v) };
        })();
  const x = (value) => MARGIN.left + ((value - xAxis.min) / (xAxis.max - xAxis.min || 1)) * innerWidth;
  const y = (value) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin)) * innerHeight;
  const px = (p) => x(xValue(p));

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${px(p).toFixed(1)},${y(p.bankroll).toFixed(1)}`).join(' ');
  const area = `${line} L${px(points[points.length - 1]).toFixed(1)},${y(0).toFixed(1)} L${px(points[0]).toFixed(1)},${y(0).toFixed(1)} Z`;

  // Downswings worth shading: the deeper ones (at least a third of the biggest), at most five.
  const shaded = useMemo(() => {
    if (!showDownswings) return [];
    const list = downswings(points);
    const biggest = list[0]?.depth ?? 0;
    return list.filter((d) => d.depth >= biggest / 3).slice(0, 5);
  }, [points, showDownswings]);

  // Peak and low markers: the best point (when above zero) and the worst (when below the start).
  const peak = points.reduce((best, p) => (p.bankroll > best.bankroll ? p : best), points[0]);
  const low = points.reduce((worst, p) => (p.bankroll < worst.bankroll ? p : worst), points[0]);

  // Nearest point to the pointer, along the x axis.
  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const target = xAxis.min + ((event.clientX - rect.left - MARGIN.left) / innerWidth) * (xAxis.max - xAxis.min);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(xValue(p) - target) < Math.abs(xValue(points[best]) - target)) best = i;
    });
    setActiveIndex(best);
  };

  // Arrow keys step through the sessions when the chart has keyboard focus.
  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, End: points.length, Home: -points.length }[event.key];
    if (step === undefined) {
      if (event.key === 'Escape' && activeIndex !== null) {
        event.stopPropagation();
        setActiveIndex(null);
      }
      return;
    }
    event.preventDefault();
    setActiveIndex((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + step)));
  };

  const active = activeIndex !== null ? points[Math.min(activeIndex, points.length - 1)] : null;
  const activeX = active ? px(active) : 0;
  const activeY = active ? y(active.bankroll) : 0;
  const activeXLabel = active ? (xMode === 'date' ? (active.date ? formatDate(active.date) : '') : xAxis.label(xValue(active))) : '';
  const fromPeak = active ? Math.max(...points.slice(0, active.index + 1).map((p) => p.bankroll)) - active.bankroll : 0;
  const last = values[values.length - 1];

  // The details card sits beside the point, on whichever side has room; on narrow screens, along the top.
  const tipSide = activeX + 200 <= width ? 'right' : activeX >= 200 ? 'left' : 'top';
  const tipStyle =
    tipSide === 'top'
      ? { left: Math.min(Math.max(activeX, 96), width - 96), top: 4 }
      : { left: activeX, top: Math.min(Math.max(activeY, 70), height - 70) };

  return (
    <div className={`bankroll-plot ${fixedHeight ? '' : 'is-fill'}`} ref={wrapRef}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        tabIndex={0}
        aria-label={`Bankroll over ${points.length - 1} sessions, now ${money.full(last)}. Use the arrow keys to read each session.`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setActiveIndex(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id="bankroll-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--text)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--text)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Downswings, shaded from the peak to the recovery (or to now), with their depth on top */}
        {shaded.map((d) => {
          const x1 = px(points[d.start]);
          const x2 = px(points[d.end ?? points.length - 1]);
          return (
            <g key={`dd${d.start}`} className="bankroll-downswing">
              <rect x={x1} y={MARGIN.top} width={Math.max(2, x2 - x1)} height={innerHeight} />
              {x2 - x1 > 44 && (
                <text x={(x1 + x2) / 2} y={MARGIN.top - 8} textAnchor="middle">
                  {money.compact(-d.depth)}
                </text>
              )}
            </g>
          );
        })}

        {/* Gridlines with axis labels */}
        {yTicks.map((tick) => (
          <g key={`y${tick}`}>
            <line className={`bankroll-grid ${tick === 0 ? 'is-zero' : ''}`} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
            <text className="bankroll-axis-label" x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {money.compact(tick)}
            </text>
          </g>
        ))}
        {xAxis.ticks.map((tick) => (
          <g key={`x${tick}`}>
            <line className="bankroll-grid is-vertical" x1={x(tick)} x2={x(tick)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
            <text className="bankroll-axis-label" x={x(tick)} y={height - MARGIN.bottom + 16} textAnchor="middle">
              {xAxis.label(tick)}
            </text>
          </g>
        ))}
        <text className="bankroll-axis-title" x={width - MARGIN.right} y={height - 4} textAnchor="end">
          {AXIS_TITLES[xMode]}
        </text>
        <text className="bankroll-axis-title" x={4} y={12}>
          Bankroll
        </text>

        {/* The curve (drawn in on first show and after each change) and one dot per session */}
        <g key={`${xMode}-${points.length}-${last}`} className="bankroll-curve">
          <path className="bankroll-area" d={area} fill="url(#bankroll-fill)" />
          <path className="bankroll-line" d={line} pathLength={1} />
        </g>
        {points.length <= MAX_DOTS &&
          points.slice(1).map((p) => (
            <circle
              key={p.session.id}
              className={`bankroll-dot ${sessionProfit(p.session) >= 0 ? 'is-win' : 'is-loss'}`}
              cx={px(p)}
              cy={y(p.bankroll)}
              r={active === p ? 6 : 3.5}
            />
          ))}

        {/* Peak and low markers */}
        {showMarkers && peak.bankroll > 0 && (
          <g className="bankroll-marker is-peak">
            <circle cx={px(peak)} cy={y(peak.bankroll)} r={7} />
            <text x={Math.min(Math.max(px(peak), MARGIN.left + 40), width - MARGIN.right - 40)} y={y(peak.bankroll) - 13} textAnchor="middle">
              Peak {money.compact(peak.bankroll)}
            </text>
          </g>
        )}
        {showMarkers && low.bankroll < 0 && (
          <g className="bankroll-marker is-low">
            <circle cx={px(low)} cy={y(low.bankroll)} r={7} />
            <text x={Math.min(Math.max(px(low), MARGIN.left + 40), width - MARGIN.right - 40)} y={y(low.bankroll) + 22} textAnchor="middle">
              Low {money.compact(low.bankroll)}
            </text>
          </g>
        )}

        {/* Crosshair and axis badges for the selected point */}
        {active && (
          <g className="bankroll-crosshair">
            <line x1={activeX} x2={activeX} y1={MARGIN.top} y2={height - MARGIN.bottom} />
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={activeY} y2={activeY} />
            <rect className="bankroll-badge" x={2} y={activeY - 11} width={MARGIN.left - 6} height={22} rx={6} />
            <text className="bankroll-badge-text" x={(MARGIN.left - 2) / 2} y={activeY} textAnchor="middle" dominantBaseline="middle">
              {money.compact(active.bankroll)}
            </text>
            <rect className="bankroll-badge" x={activeX - 28} y={height - MARGIN.bottom + 3} width={56} height={20} rx={6} />
            <text className="bankroll-badge-text" x={activeX} y={height - MARGIN.bottom + 13} textAnchor="middle" dominantBaseline="middle">
              {activeXLabel}
            </text>
          </g>
        )}
      </svg>

      {/* Details card, flipped to the left near the right edge */}
      {active && (
        <div className={`bankroll-tooltip is-${tipSide}`} style={tipStyle}>
          <span className="bankroll-tooltip-title">
            {active.session ? `${formatDate(active.session.date)} · ${active.session.game} ${active.session.stakes}` : 'Start'}
          </span>
          {active.session && <span className="bankroll-tooltip-meta">{active.session.venue}</span>}
          <span>
            Bankroll <strong className="num">{money.full(active.bankroll)}</strong>
          </span>
          {active.session && (
            <span>
              Session{' '}
              <strong className={`num ${sessionProfit(active.session) >= 0 ? 'is-win' : 'is-loss'}`}>{money.full(sessionProfit(active.session))}</strong>
            </span>
          )}
          <span>
            Hours in <strong className="num">{hoursLabel(active.hours)}</strong>
          </span>
          {fromPeak > 0 && (
            <span>
              From peak <strong className="num is-loss">{money.full(-fromPeak)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
