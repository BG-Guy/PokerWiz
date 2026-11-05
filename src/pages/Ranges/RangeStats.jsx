// The two numbers under the grid: how much of all hands is in the range that gets to this spot, and how many of
// those hands mix their play (a tap lists them).
import Icon from '../../components/Icon/Icon.jsx';
import { percent } from './actionStyle.js';
import './RangeStats.css';

export default function RangeStats({ grid, onMixed }) {
  const { range, mixed } = grid;
  return (
    <div className="rg-stats">
      <div className="rg-stat">
        <span className="rg-stat-label">Range</span>
        <span className="rg-stat-value num">{percent(range.share, range.share < 0.995 ? 1 : 0)}</span>
        <span className="rg-stat-sub">{Math.round(range.combos).toLocaleString('en-US')} combos</span>
      </div>
      <button type="button" className="rg-stat is-button" onClick={onMixed} aria-haspopup="dialog">
        <span className="rg-stat-label">Mixed hands</span>
        <span className="rg-stat-value num">{mixed}</span>
        <span className="rg-stat-sub">{mixed ? 'Tap to see them' : 'None here'}</span>
        <Icon name="chevronRight" size={16} className="rg-stat-chevron" />
      </button>
    </div>
  );
}
