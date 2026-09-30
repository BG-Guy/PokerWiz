// Rounded progress bar. The optional marker shows where you "should" be (e.g. time elapsed).
import './ProgressBar.css';

// value and marker are fractions from 0 to 1. tone: "accent" | "warning" | "negative".
export default function ProgressBar({ value, marker, tone = 'accent', label }) {
  const percent = Math.round(value * 100);

  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className={`progress-bar-fill is-${tone}`} style={{ width: `${percent}%` }} />
      {marker !== undefined && (
        <span className="progress-bar-marker" style={{ left: `${Math.min(100, marker * 100)}%` }} title="Where you should be by now" />
      )}
    </div>
  );
}
