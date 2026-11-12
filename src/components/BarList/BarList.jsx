// Horizontal bar list. When any value is negative, bars grow left/right from a center line.
import Icon from '../Icon/Icon.jsx';
import './BarList.css';

// items: [{ label, value }]; formatValue turns a number into display text. onOpen(item): rows become buttons
// that open what's behind them (the hands of that seat, say).
export default function BarList({ items, formatValue = String, onOpen }) {
  const maxAbs = Math.max(1e-9, ...items.map((item) => Math.abs(item.value)));
  const diverging = items.some((item) => item.value < 0);

  return (
    <ul className={`bar-list ${diverging ? 'is-diverging' : ''} ${onOpen ? 'is-clickable' : ''}`}>
      {items.map((item) => {
        // Diverging bars use half the track on each side of the center line.
        const share = (Math.abs(item.value) / maxAbs) * (diverging ? 50 : 100);
        const barStyle =
          diverging && item.value < 0 ? { right: '50%', width: `${share}%` } : { left: diverging ? '50%' : 0, width: `${share}%` };
        const cells = (
          <>
            <span className="bar-list-label">{item.label}</span>
            <span className="bar-list-track">
              <span className={`bar-list-bar ${item.value < 0 ? 'is-negative' : ''}`} style={barStyle} />
            </span>
            <span className={`bar-list-value num ${item.value < 0 ? 'is-negative' : 'is-positive'}`}>{formatValue(item.value)}</span>
          </>
        );

        return (
          <li key={item.label}>
            {onOpen ? (
              <button type="button" className="bar-list-row bar-list-open" onClick={() => onOpen(item)} aria-haspopup="dialog" aria-label={`${item.label}: ${formatValue(item.value)}. Show what's behind it`}>
                {cells}
                <Icon name="chevronRight" size={14} />
              </button>
            ) : (
              <div className="bar-list-row">{cells}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
