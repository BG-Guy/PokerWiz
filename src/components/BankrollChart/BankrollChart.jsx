// Bankroll chart: bankroll (running profit) against hours played, drawn like a classic chart with labelled
// axes, gridlines, a zero line and one dot per session. Hover (desktop) or tap/drag (phone) to read a point:
// a crosshair with badges on both axes plus a card with hours in, bankroll and that session's result.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatUnits, getMoneyUnit } from '../../utils/format.js';
import { sessionProfit } from '../../utils/stats.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import FilterChips from '../FilterChips/FilterChips.jsx';
import './BankrollChart.css';

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: '90', label: '90 days' },
  { value: '30', label: '30 days' },
];
const MARGIN = { top: 30, right: 18, bottom: 40, left: 62 };

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

// Width of the chart's container, kept in sync as the layout changes.
function useWidth(ref) {
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const hoursLabel = (h) => `${Math.round(h * 10) / 10}h`;
// Axis labels: "$1.2k" / "1.2k bb" for big numbers. Sessions come in already converted to the display unit.
function compactMoney(v) {
  const minus = v < 0 ? '-' : '';
  if (Math.abs(v) >= 1000) {
    const k = `${Math.round(Math.abs(v) / 100) / 10}k`;
    return getMoneyUnit() === 'bb' ? `${minus}${k} bb` : `${minus}$${k}`;
  }
  return `${minus}${formatUnits(Math.abs(v), { sign: false, whole: true })}`;
}

export default function BankrollChart({ sessions }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [range, setRange] = useState('all');
  const [activeIndex, setActiveIndex] = useState(null);
  const isTouch = useMediaQuery('(pointer: coarse)');
  const height = width < 520 ? 250 : 310;

  // Points: start at 0 hours / $0, then one point per session in date order.
  const points = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => `${a.date}${a.startedAt ?? ''}`.localeCompare(`${b.date}${b.startedAt ?? ''}`));
    let visible = sorted;
    if (range !== 'all' && sorted.length) {
      const last = new Date(sorted[sorted.length - 1].date);
      last.setDate(last.getDate() - Number(range));
      const cutoff = last.toISOString().slice(0, 10);
      visible = sorted.filter((s) => s.date > cutoff);
    }
    let hours = 0;
    let bankroll = 0;
    const list = [{ hours: 0, bankroll: 0, session: null }];
    for (const session of visible) {
      hours += session.durationMin / 60;
      bankroll += sessionProfit(session);
      list.push({ hours, bankroll, session });
    }
    return list;
  }, [sessions, range]);

  // Scales.
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const values = points.map((p) => p.bankroll);
  const yTicks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const lastHours = points[points.length - 1].hours || 1;
  const xTicks = niceTicks(0, lastHours, width < 520 ? 4 : 6);
  const xMax = xTicks[xTicks.length - 1];
  const x = (hours) => MARGIN.left + (hours / xMax) * innerWidth;
  const y = (value) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin)) * innerHeight;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.hours).toFixed(1)},${y(p.bankroll).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points[points.length - 1].hours).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  // Nearest point to the pointer (by hours).
  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hours = ((event.clientX - rect.left - MARGIN.left) / innerWidth) * xMax;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.hours - hours) < Math.abs(points[best].hours - hours)) best = i;
    });
    setActiveIndex(best);
  };

  const active = activeIndex !== null ? points[Math.min(activeIndex, points.length - 1)] : null;
  const activeX = active ? x(active.hours) : 0;
  const activeY = active ? y(active.bankroll) : 0;

  return (
    <div className="bankroll-chart">
      <div className="bankroll-chart-controls">
        <FilterChips options={RANGES} value={range} onChange={(value) => { setRange(value); setActiveIndex(null); }} label="Time range" />
        <span className="bankroll-chart-hint">{isTouch ? 'Tap or drag on the chart' : 'Hover the chart'} to read it</span>
      </div>

      <div className="bankroll-chart-plot" ref={wrapRef}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Bankroll over ${hoursLabel(lastHours)} of play, now ${formatUnits(values[values.length - 1], { whole: true })}`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(event) => event.pointerType === 'mouse' && setActiveIndex(null)}
        >
          <defs>
            <linearGradient id="bankroll-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Gridlines with axis labels */}
          {yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line className={`bankroll-grid ${tick === 0 ? 'is-zero' : ''}`} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
              <text className="bankroll-axis-label" x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
                {compactMoney(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <g key={`x${tick}`}>
              <line className="bankroll-grid is-vertical" x1={x(tick)} x2={x(tick)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
              <text className="bankroll-axis-label" x={x(tick)} y={height - MARGIN.bottom + 16} textAnchor="middle">
                {hoursLabel(tick)}
              </text>
            </g>
          ))}
          <text className="bankroll-axis-title" x={width - MARGIN.right} y={height - 4} textAnchor="end">
            Hours played
          </text>
          <text className="bankroll-axis-title" x={4} y={12}>
            Bankroll
          </text>

          {/* The curve and one dot per session */}
          <path d={area} fill="url(#bankroll-fill)" />
          <path className="bankroll-line" d={line} />
          {points.slice(1).map((p, i) => (
            <circle
              key={p.session.id}
              className={`bankroll-dot ${sessionProfit(p.session) >= 0 ? 'is-win' : 'is-loss'}`}
              cx={x(p.hours)}
              cy={y(p.bankroll)}
              r={activeIndex === i + 1 ? 6 : 3.5}
            />
          ))}

          {/* Crosshair and axis badges for the selected point */}
          {active && (
            <g className="bankroll-crosshair">
              <line x1={activeX} x2={activeX} y1={MARGIN.top} y2={height - MARGIN.bottom} />
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={activeY} y2={activeY} />
              <rect className="bankroll-badge" x={2} y={activeY - 11} width={MARGIN.left - 6} height={22} rx={6} />
              <text className="bankroll-badge-text" x={(MARGIN.left - 2) / 2} y={activeY} textAnchor="middle" dominantBaseline="middle">
                {compactMoney(active.bankroll)}
              </text>
              <rect className="bankroll-badge" x={activeX - 26} y={height - MARGIN.bottom + 3} width={52} height={20} rx={6} />
              <text className="bankroll-badge-text" x={activeX} y={height - MARGIN.bottom + 13} textAnchor="middle" dominantBaseline="middle">
                {hoursLabel(active.hours)}
              </text>
            </g>
          )}
        </svg>

        {/* Details card, flipped to the left near the right edge */}
        {active && (
          <div
            className={`bankroll-tooltip ${activeX > width * 0.6 ? 'is-left' : ''}`}
            style={{ left: activeX, top: Math.max(activeY, 60) }}
          >
            <span className="bankroll-tooltip-title">
              {active.session ? `${formatDate(active.session.date)} · ${active.session.game} ${active.session.stakes}` : 'Start'}
            </span>
            <span>
              Hours in <strong className="num">{hoursLabel(active.hours)}</strong>
            </span>
            <span>
              Bankroll <strong className="num">{formatUnits(active.bankroll, { whole: true })}</strong>
            </span>
            {active.session && (
              <span>
                Session{' '}
                <strong className={`num ${sessionProfit(active.session) >= 0 ? 'is-win' : 'is-loss'}`}>
                  {formatUnits(sessionProfit(active.session))}
                </strong>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
