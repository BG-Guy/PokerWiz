// Ring gauge for the hand's accuracy (0-100), colored by how good it is, with the label underneath.
import './AccuracyGauge.css';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function AccuracyGauge({ value, label }) {
  const safe = value ?? 0;
  const tone = safe >= 80 ? 'good' : safe >= 55 ? 'warn' : 'bad';
  return (
    <div className={`accuracy-gauge is-${tone}`} role="img" aria-label={`Accuracy ${safe}%, ${label}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="accuracy-gauge-track" cx="60" cy="60" r={RADIUS} />
        <circle
          className="accuracy-gauge-value"
          cx="60"
          cy="60"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - safe / 100)}
          style={{ '--circumference': CIRCUMFERENCE }}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="accuracy-gauge-center">
        <span className="accuracy-gauge-number num">
          {safe}
          <small>%</small>
        </span>
        <span className="accuracy-gauge-label">{label}</span>
      </div>
    </div>
  );
}
