// The classic 13x13 range grid: each cell is a starting hand, shaded by how much of it the coach thinks the
// player still holds (pairs on the diagonal, suited above it, offsuit below).
import { CLASS_NAMES } from '../../coach/combos.js';
import './RangeGrid.css';

export default function RangeGrid({ grid, label }) {
  return (
    <div className="range-grid" role="img" aria-label={label}>
      {CLASS_NAMES.map((name, cls) => (
        <span key={name} className={`range-grid-cell ${grid[cls] > 0.05 ? 'is-in' : ''}`} style={{ '--weight': grid[cls] }}>
          {name}
        </span>
      ))}
    </div>
  );
}
