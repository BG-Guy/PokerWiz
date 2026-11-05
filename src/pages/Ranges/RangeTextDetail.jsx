// The sheet behind the "as text" card: every action of the spot with the hands that take it, written as ranges
// ("55+, A8s+, KTs+") that can be copied. Hands that take an action only now and then are listed apart.
import { useMemo } from 'react';
import { actionRangeText } from '../../gto/preflop/scenarioGrid.js';
import { colorOf, percent } from './actionStyle.js';
import RangeNotation from './RangeNotation.jsx';
import './RangeTextDetail.css';

export default function RangeTextDetail({ grid }) {
  const sections = useMemo(
    () =>
      grid.order
        .filter((a) => grid.actions[a].share >= 0.0005)
        .map((a) => ({ action: grid.actions[a], ...actionRangeText(grid, a) })),
    [grid]
  );
  return (
    <div className="rg-text">
      <p className="rg-text-lead">
        The hands that take each action in <strong>{grid.scenario.title}</strong>, at {grid.scenario.stack} bb. A hand is listed where it takes the action at least half the time.
      </p>
      {sections.map(({ action, always, sometimes }) => (
        <section key={action.index} className="rg-text-section">
          <h3 className="rg-text-title">
            <span className="rg-text-dot" style={{ background: colorOf(action, grid.actions) }} />
            {action.label}
            <span className="rg-text-share num">{percent(action.share, 1)}</span>
          </h3>
          <RangeNotation always={always} sometimes={sometimes} />
        </section>
      ))}
    </div>
  );
}
