// The stack-depth picker: the solved cash depths side by side, all visible at once (20 to 200 big blinds).
import './DepthChips.css';

// value: the depth in bb. busy: the chart for it is still loading. stacked: the label above the chips, for a narrow column.
export default function DepthChips({ depths, value, onChange, busy = false, stacked = false }) {
  return (
    <div className={`rg-depth ${stacked ? 'is-stacked' : ''}`} role="group" aria-label="Stack depth in big blinds" aria-busy={busy || undefined}>
      <span className="rg-depth-label">
        Stack <span className="rg-depth-unit">bb</span>
      </span>
      <div className="rg-depth-chips">
        {depths.map((depth) => (
          <button key={depth} type="button" className={`rg-depth-chip num ${depth === value ? 'is-active' : ''}`} aria-pressed={depth === value} aria-label={`${depth} big blinds`} onClick={() => onChange(depth)}>
            {depth}
          </button>
        ))}
      </div>
    </div>
  );
}
