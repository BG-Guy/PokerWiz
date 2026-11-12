// The two numbers under the grid: how much of all hands is in the range that gets to this spot (a tap says what
// that range is made of and what it does), and how many of those hands mix their play (a tap lists them).
import { useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon/Icon.jsx';
import DetailSheet from '../../components/DetailSheet/DetailSheet.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import { HAND_COUNT } from '../../gto/cards.js';
import { percent } from './actionStyle.js';
import './RangeStats.css';

const combosText = (n) => `${Math.round(n).toLocaleString('en-US')} combos`;

// What the range that gets to the spot is made of, as a detail for StatDetail. grid: from buildGrid.
function rangeDetail(grid) {
  const { range, scenario, cells, actions, order } = grid;
  // Pairs, suited and offsuit hands by how much of each class arrives here.
  const kinds = { pairs: 0, suited: 0, offsuit: 0 };
  for (const cell of cells) kinds[cell.name.length === 2 ? 'pairs' : cell.name.endsWith('s') ? 'suited' : 'offsuit'] += cell.combos * cell.reach;
  const whole = range.share >= 0.995;
  return {
    title: 'The range that gets here',
    lead: { value: percent(range.share, whole ? 0 : 1), caption: `${combosText(range.combos)} of ${HAND_COUNT.toLocaleString('en-US')} from ${scenario.position}` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Pairs', value: combosText(kinds.pairs) },
          { label: 'Suited', value: combosText(kinds.suited) },
          { label: 'Offsuit', value: combosText(kinds.offsuit) },
          { label: 'Hands that mix', value: String(grid.mixed), hint: 'take more than one play' },
        ],
      },
      {
        type: 'list',
        title: 'What it does here',
        items: order.map((a) => ({ label: actions[a].label, hint: combosText(actions[a].combos), value: percent(actions[a].share, 1) })),
      },
      {
        type: 'text',
        title: 'Reading it',
        paragraphs: [
          whole
            ? 'Nothing has narrowed your range yet: every hand can get to this decision, so the shares above are shares of all hands.'
            : 'These are the hands still in your range when the action gets to this decision: what your earlier plays left. The shares above are shares of this range, not of all hands.',
        ],
      },
    ],
  };
}

export default function RangeStats({ grid, onMixed }) {
  const { range, mixed } = grid;
  const [open, setOpen] = useState(false);
  const tileRef = useRef(null);
  const detail = useMemo(() => rangeDetail(grid), [grid]);
  return (
    <div className="rg-stats">
      <button type="button" className="rg-stat is-button" onClick={() => setOpen(true)} ref={tileRef} aria-haspopup="dialog">
        <span className="rg-stat-label">Range</span>
        <span className="rg-stat-value num">{percent(range.share, range.share < 0.995 ? 1 : 0)}</span>
        <span className="rg-stat-sub">{Math.round(range.combos).toLocaleString('en-US')} combos</span>
        <Icon name="chevronRight" size={16} className="rg-stat-chevron" />
      </button>
      <button type="button" className="rg-stat is-button" onClick={onMixed} aria-haspopup="dialog">
        <span className="rg-stat-label">Mixed hands</span>
        <span className="rg-stat-value num">{mixed}</span>
        <span className="rg-stat-sub">{mixed ? 'Tap to see them' : 'None here'}</span>
        <Icon name="chevronRight" size={16} className="rg-stat-chevron" />
      </button>
      <DetailSheet open={open} onClose={() => setOpen(false)} title={detail.title} originRef={tileRef}>
        <StatDetail detail={detail} />
      </DetailSheet>
    </div>
  );
}
