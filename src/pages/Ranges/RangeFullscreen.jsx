// The grid at the biggest size the screen allows, upright or sideways: the cells stretch to fill the room, the legend
// above the hand strip doubles as the highlight switch, and tapping a cell shows it in the strip at the bottom
// (no sheet in the way). "Details" opens the full sheet over it; the grid icon in the bar changes the spot.
import FullscreenView from '../../components/FullscreenView/FullscreenView.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import StrategyGrid from './StrategyGrid.jsx';
import ActionLegend from './ActionLegend.jsx';
import HandDetail from './HandDetail.jsx';
import './RangeFullscreen.css';

export default function RangeFullscreen({ open, onClose, grid, depth, highlight, onHighlight, selected, onSelect, onDetails, onChangeSpot }) {
  const { scenario } = grid;
  return (
    <FullscreenView
      open={open}
      onClose={onClose}
      title={scenario.title}
      subtitle={`${depth} bb · ${scenario.subtitle}`}
      className="rg-fullscreen"
      actions={
        <button type="button" className="rg-full-action" onClick={onChangeSpot} aria-label="Change spot">
          <Icon name="grid" size={20} />
        </button>
      }
    >
      <div className="rg-full">
        <div className="rg-full-board">
          <StrategyGrid key={scenario.id} grid={grid} fill highlight={highlight} selected={selected} onSelect={onSelect} label={`${scenario.title} range`} />
        </div>
        <div className="rg-full-side">
          <ActionLegend grid={grid} highlight={highlight} onHighlight={onHighlight} layout="chips" />
          {selected === null ? (
            <p className="rg-full-hint">Tap a hand to see what to do with it.</p>
          ) : (
            <HandDetail grid={grid} cls={selected} variant="strip" onMore={onDetails} />
          )}
        </div>
      </div>
    </FullscreenView>
  );
}
