// Every kind of spot that has come up, costliest first. Chips narrow the list to one street (preflop, flop, turn,
// river). Each row says how often the spot came up, which way you lean and what it costs, and opens that leak's page.
import { useState } from 'react';
import DrillRow from '../../components/DrillRow/DrillRow.jsx';
import GradeBadge from '../../components/GradeBadge/GradeBadge.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import { leanLabel } from '../../coach/leaks.js';
import { lossText } from '../../coach/leakDetails.js';
import { plural } from '../../utils/format.js';
import './AreaList.css';

const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];

// areas: from leakOverview (costliest first). selectedId: the open leak on a wide screen (highlighted).
export default function AreaList({ areas, selectedId = null }) {
  const [street, setStreet] = useState('all');
  const maxCost = Math.max(0.01, ...areas.map((entry) => entry.cost));
  const streets = STREETS.filter((name) => areas.some((entry) => entry.area.street === name));
  const shown = street === 'all' ? areas : areas.filter((entry) => entry.area.street === street);

  return (
    <div className="area-list">
      {streets.length > 1 && (
        <FilterChips
          label="Street"
          value={street}
          onChange={setStreet}
          options={[{ value: 'all', label: 'All', count: areas.length }, ...streets.map((name) => ({ value: name, label: name, count: areas.filter((entry) => entry.area.street === name).length }))]}
        />
      )}
      <ul className="area-list-rows" key={street}>
        {shown.map((entry) => (
          <li key={entry.area.id}>
            <DrillRow
              to={`/leaks/${entry.area.id}`}
              lead={<GradeBadge score={entry.avgScore} size="sm" />}
              title={entry.area.name}
              subtitle={`${plural(entry.count, 'spot')} · ${leanLabel(entry, entry.area) ?? (entry.count < 5 ? 'early read' : 'no clear lean')}`}
              value={lossText(entry.cost)}
              tone={entry.cost > 0 ? 'negative' : undefined}
              meter={entry.cost / maxCost}
              selected={entry.area.id === selectedId}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
