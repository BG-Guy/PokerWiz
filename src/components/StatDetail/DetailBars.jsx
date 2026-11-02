// Month-by-month bars for a detail view. Signed values grow up (wins) or down (losses) from a center line;
// tap or hover a bar to read its exact value.
import { useState } from 'react';
import './DetailBars.css';

// items: [{ key, label, value, display, title }]. signed: values can be negative.
export default function DetailBars({ items, signed = true }) {
  const [picked, setPicked] = useState(items.length - 1);
  const maxAbs = Math.max(1e-9, ...items.map((item) => Math.abs(item.value)));
  const hasNegative = signed && items.some((item) => item.value < 0);
  const current = items[picked] ?? items.at(-1);

  return (
    <div className={`detail-bars ${hasNegative ? 'is-signed' : ''}`}>
      {/* The bar you're reading, in words */}
      <p className="detail-bars-readout">
        <span>{current.title}</span>
        <strong className={`num ${signed && current.value < 0 ? 'is-negative' : signed && current.value > 0 ? 'is-positive' : ''}`}>{current.display}</strong>
      </p>

      <div className="detail-bars-plot" role="list">
        {items.map((item, i) => {
          const share = (Math.abs(item.value) / maxAbs) * (hasNegative ? 50 : 100);
          const negative = item.value < 0;
          return (
            <button
              key={item.key}
              type="button"
              role="listitem"
              className={`detail-bars-col ${i === picked ? 'is-picked' : ''}`}
              onPointerEnter={(event) => event.pointerType === 'mouse' && setPicked(i)}
              onFocus={() => setPicked(i)}
              onClick={() => setPicked(i)}
              aria-label={`${item.title}: ${item.display}`}
              style={{ '--i': i }}
            >
              <span className="detail-bars-track">
                <span
                  className={`detail-bars-bar ${signed ? (negative ? 'is-negative' : 'is-positive') : ''}`}
                  style={hasNegative ? { height: `${share}%`, [negative ? 'top' : 'bottom']: '50%' } : { height: `${share}%`, bottom: 0 }}
                />
              </span>
              <span className="detail-bars-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
