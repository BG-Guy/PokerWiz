// The TLDR card of the current spot, at the top of the page on phones: who you are, the line so far, and how the
// range splits between the actions. Tapping it opens the sheet where you pick another spot.
import Icon from '../../components/Icon/Icon.jsx';
import ActionBar from './ActionBar.jsx';
import SeatBadge from './SeatBadge.jsx';
import './ScenarioSummary.css';

export default function ScenarioSummary({ grid, onOpen }) {
  const { scenario } = grid;
  return (
    <button type="button" className="rg-summary" onClick={onOpen} aria-haspopup="dialog">
      <span className="rg-summary-top">
        <SeatBadge position={scenario.position} size="lg" />
        <span className="rg-summary-main">
          <span className="rg-summary-title">{scenario.title}</span>
          <span className="rg-summary-sub">{scenario.subtitle}</span>
        </span>
        <span className="rg-summary-change">
          Change
          <Icon name="chevronRight" size={16} />
        </span>
      </span>
      <ActionBar grid={grid} />
    </button>
  );
}
