// One player trait as a meter: a slider between two ends ("Tight" ... "Loose") with a word for where it sits.
// readOnly shows the same meter without the slider (for reports).
import { useId } from 'react';
import './TraitMeter.css';

// Word for the current value: the low end, the middle, or the high end.
function describe(value, low, high) {
  if (value <= 20) return `Very ${low.toLowerCase()}`;
  if (value < 40) return low;
  if (value <= 60) return 'Neutral';
  if (value < 80) return high;
  return `Very ${high.toLowerCase()}`;
}

export default function TraitMeter({ label, low, high, value, onChange, readOnly = false }) {
  const id = useId();
  return (
    <div className={`trait-meter ${readOnly ? 'is-readonly' : ''}`} style={{ '--value': `${value}%` }}>
      <div className="trait-meter-top">
        <label className="trait-meter-label" htmlFor={id}>
          {label}
        </label>
        <span className="trait-meter-word">{describe(value, low, high)}</span>
      </div>

      {readOnly ? (
        <div className="trait-meter-track" aria-hidden="true">
          <span className="trait-meter-fill" />
          <span className="trait-meter-dot" />
        </div>
      ) : (
        <input
          id={id}
          className="trait-meter-input"
          type="range"
          min="0"
          max="100"
          step="5"
          value={value}
          aria-valuetext={describe(value, low, high)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}

      <div className="trait-meter-ends" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
