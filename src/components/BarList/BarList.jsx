// Horizontal bar list. When any value is negative, bars grow left/right from a center line.
import './BarList.css';

// items: [{ label, value }]; formatValue turns a number into display text.
export default function BarList({ items, formatValue = String }) {
  const maxAbs = Math.max(1e-9, ...items.map((item) => Math.abs(item.value)));
  const diverging = items.some((item) => item.value < 0);

  return (
    <ul className={`bar-list ${diverging ? 'is-diverging' : ''}`}>
      {items.map((item) => {
        // Diverging bars use half the track on each side of the center line.
        const share = (Math.abs(item.value) / maxAbs) * (diverging ? 50 : 100);
        const barStyle =
          diverging && item.value < 0 ? { right: '50%', width: `${share}%` } : { left: diverging ? '50%' : 0, width: `${share}%` };

        return (
          <li key={item.label} className="bar-list-row">
            <span className="bar-list-label">{item.label}</span>
            <span className="bar-list-track">
              <span className={`bar-list-bar ${item.value < 0 ? 'is-negative' : ''}`} style={barStyle} />
            </span>
            <span className={`bar-list-value num ${item.value < 0 ? 'is-negative' : 'is-positive'}`}>
              {formatValue(item.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
