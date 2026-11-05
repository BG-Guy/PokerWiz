// One line of play in a list of spots ("vs BTN open"): who it's against, the sizes, how much of the range plays on
// and, as a thin bar, how often the spot comes up. Tap it and the page shows that spot.
import DrillRow from '../../components/DrillRow/DrillRow.jsx';
import SeatBadge from './SeatBadge.jsx';
import { percent } from './actionStyle.js';

// How often a spot comes up, as 0..1 for the meter: the most common one of the list is full, each tenth of that
// a third less (spots span a thousandfold).
const commonness = (weight, max) => (max > 0 && weight > 0 ? Math.min(1, Math.max(0.04, 1 + Math.log10(weight / max) / 3)) : 0);

// group: { base, variants } from situationsFor. maxWeight: the most common weight in the list.
export default function SpotRow({ group, selected, onSelect, maxWeight, className = '' }) {
  const { base, variants } = group;
  const callers = variants.length ? ` · +${variants.length} with callers` : '';
  return (
    <DrillRow
      lead={<SeatBadge position={base.villainPosition ?? base.position} />}
      title={base.versus}
      subtitle={`${base.subtitle}${callers}`}
      value={percent(base.headline.share)}
      hint={base.headline.label}
      meter={commonness(base.weight, maxWeight)}
      selected={selected}
      onClick={() => onSelect(base)}
      className={className}
    />
  );
}
