// Responsive SVG line chart with a soft area fill. "compact" turns it into a tiny sparkline.
import { useId } from 'react';
import './LineChart.css';

const WIDTH = 600;

// data: [{ label, value }]. formatLabel / formatValue control the axis text.
export default function LineChart({ data, height = 220, compact = false, formatLabel = String, formatValue = String }) {
  const gradientId = `line-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const values = data.map((d) => d.value);

  // Value range: full charts always include zero so wins and losses read correctly.
  const min = compact ? Math.min(...values) : Math.min(0, ...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = height * 0.08;

  // Convert each value to an x/y point in SVG space.
  const points = data.map((d, i) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * WIDTH : WIDTH / 2,
    y: pad + (1 - (d.value - min) / range) * (height - pad * 2),
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${WIDTH},${height} L0,${height} Z`;
  const zeroY = pad + (1 - (0 - min) / range) * (height - pad * 2);
  const last = points[points.length - 1];

  // Axis labels: first, middle and last point.
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];

  return (
    <div className={`line-chart ${compact ? 'is-compact' : ''}`}>
      <div className="line-chart-plot" style={{ height }}>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {!compact && min < 0 && <line className="line-chart-zero" x1="0" x2={WIDTH} y1={zeroY} y2={zeroY} />}
          <path d={area} fill={`url(#${gradientId})`} />
          <path className="line-chart-line" d={line} />
        </svg>

        {/* Dot on the latest value, drawn in HTML so it stays round when the SVG stretches */}
        <span
          className="line-chart-dot"
          style={{ left: `${(last.x / WIDTH) * 100}%`, top: `${(last.y / height) * 100}%` }}
        />

        {!compact && (
          <>
            <span className="line-chart-y line-chart-y-max num">{formatValue(max)}</span>
            {min < 0 && <span className="line-chart-y line-chart-y-min num">{formatValue(min)}</span>}
          </>
        )}
      </div>

      {!compact && (
        <div className="line-chart-x">
          {labelIndexes.map((i) => (
            <span key={i}>{formatLabel(data[i].label)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
