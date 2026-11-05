// The sheet behind the "their range" card: the opponent's range as a grid (how often they hold each hand when the
// action gets here), its size, and the same range as text. Tap a hand to see how often they have it. For an opening
// spot it is your own range instead (every hand you play).
import { useMemo, useState } from 'react';
import { rangeText, weightsGrid } from '../../gto/preflop/scenarioGrid.js';
import DrillRow from '../../components/DrillRow/DrillRow.jsx';
import StrategyGrid from './StrategyGrid.jsx';
import SeatBadge from './SeatBadge.jsx';
import RangeNotation from './RangeNotation.jsx';
import { percent } from './actionStyle.js';
import './TheirRangeDetail.css';

// weights: Float32Array(169). who: "BTN" or "You". verb: "opens", "3-bets", "play" ...
// from: the spot where they made their move ({ spot, go }), a way to see how they chose it; none for your own range.
export default function TheirRangeDetail({ scenario, weights, who, verb, from }) {
  const grid = useMemo(() => weightsGrid(scenario, weights), [scenario, weights]);
  const [picked, setPicked] = useState(null);
  const notation = useMemo(() => rangeText(weights, 0.5), [weights]);
  const { share, combos } = grid.range;

  return (
    <div className="rg-range">
      <p className="rg-range-lead">
        <span className="rg-range-share num">{percent(share, 1)}</span>
        <span className="rg-range-caption">
          of all hands: {who} {verb} {Math.round(combos).toLocaleString('en-US')} of 1,326 combos
        </span>
      </p>
      <StrategyGrid grid={grid} selected={picked} onSelect={setPicked} label={`${who} range`} />
      <p className="rg-range-pick" aria-live="polite">
        {picked === null ? 'Tap a hand to see how often it is in the range.' : `${grid.cells[picked].name}: in the range ${percent(weights[picked])} of the time.`}
      </p>
      <h3 className="rg-range-title">As text</h3>
      <RangeNotation always={notation} />
      <p className="rg-range-note">The text lists the hands in the range at least half the time. A part-filled cell is in the range only part of the time.</p>
      {from && (
        <>
          <h3 className="rg-range-title">Where it comes from</h3>
          <DrillRow
            lead={<SeatBadge position={from.spot.position} />}
            title={from.spot.title}
            subtitle={`See how ${who} chooses this move`}
            value={percent(from.spot.headline.share)}
            hint={from.spot.headline.label}
            onClick={from.go}
          />
        </>
      )}
    </div>
  );
}
