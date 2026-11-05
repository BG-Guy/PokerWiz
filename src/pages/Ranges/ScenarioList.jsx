// The desktop spot picker, always on the left: your seat as chips (picking one jumps to its most common spot), then
// that seat's spots in groups (open, facing an open, your open vs a 3-bet ...) as rows. One click to any spot.
import { useMemo } from 'react';
import { POSITIONS } from '../../gto/preflop/tree.js';
import { situationsFor } from '../../gto/preflop/scenarios.js';
import SpotRow from './SpotRow.jsx';
import './ScenarioList.css';

export default function ScenarioList({ scenarios, current, onSelect }) {
  const situations = useMemo(() => situationsFor(scenarios, current.seat), [scenarios, current.seat]);
  // A seat's first spot: its opening, or for the big blind the most common open it faces.
  const firstSpotOf = (seat) => situationsFor(scenarios, seat)[0]?.groups[0].base;

  return (
    <nav className="rg-list" aria-label="Spots">
      <div className="rg-list-seats" role="group" aria-label="Your seat">
        {POSITIONS.map((position, seat) => (
          <button
            key={position}
            type="button"
            className={`rg-list-seat num ${current.seat === seat ? 'is-active' : ''}`}
            aria-pressed={current.seat === seat}
            onClick={() => {
              const first = firstSpotOf(seat);
              if (first) onSelect(first);
            }}
          >
            {position}
          </button>
        ))}
      </div>

      {situations.map((kind) => {
        const maxWeight = Math.max(...kind.groups.map((g) => g.base.weight));
        return (
          <section key={kind.id} className="rg-list-section">
            <h3 className="rg-list-heading">{kind.title}</h3>
            <div className="rg-list-rows">
              {kind.groups.map((group) => (
                <SpotRow key={group.id} group={group} maxWeight={maxWeight} selected={current.groupId === group.id} onSelect={onSelect} className="rg-list-row" />
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
