// A stacked colour bar of how a range or a hand splits between a spot's actions, with the numbers under it
// ("3-bet 12.7% · Call 56.1% · Fold 31.1%"). Biggest bet on the left, fold on the right, like the grid cells.
import { colorOf, barBackground, percent } from './actionStyle.js';
import './ActionBar.css';

// grid: from buildGrid. shares: one number per action (default: the range's totals). digits: decimals in the text.
// text: false leaves the numbers out (just the bar).
export default function ActionBar({ grid, shares, digits = 0, text = true, size = 'md', className = '' }) {
  const { actions, order } = grid;
  const share = (a) => (shares ? shares[a] : actions[a].share);
  const parts = order.map((a) => ({ color: colorOf(actions[a], actions), share: share(a) }));
  const shown = order.filter((a) => share(a) >= 0.0005);
  return (
    <div className={`rg-bar is-${size} ${className}`}>
      <span className="rg-bar-track" style={{ background: barBackground(parts) }} role="img" aria-label={shown.map((a) => `${actions[a].short} ${percent(share(a), digits)}`).join(', ')} />
      {text && (
        <span className="rg-bar-text">
          {shown.map((a) => (
            <span key={a} className="rg-bar-item">
              <span className="rg-bar-dot" style={{ background: colorOf(actions[a], actions) }} />
              {actions[a].short} <span className="num">{percent(share(a), digits)}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
