// Ranges (/ranges): a preflop range browser over the solved charts. Pick a stack depth and a spot (your seat, what is
// happening, against whom) and see the whole 13x13 strategy at once: how often GTO folds, calls or raises each
// starting hand, and what it costs to get it wrong.
//   Phones: a summary card of the spot (tap it to change the spot in a slide-up drill-down), the grid at full width,
//   a legend that filters by action, TLDR boxes that open sheets, a sheet per hand, and a full-screen grid.
//   Desktop: the spot list on the left, the grid and a hand panel (hover to preview, click to keep) on the right.
// What is shown lives in the link (see useRangeSpot), so other pages can link to a range.
import { useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import { useRangeSpot, DEPTHS } from './useRangeSpot.js';
import ScenarioSummary from './ScenarioSummary.jsx';
import ScenarioPicker from './ScenarioPicker.jsx';
import ScenarioList from './ScenarioList.jsx';
import DepthChips from './DepthChips.jsx';
import VariantChips from './VariantChips.jsx';
import StrategyGrid from './StrategyGrid.jsx';
import ActionLegend from './ActionLegend.jsx';
import HandDetail from './HandDetail.jsx';
import HandSheet from './HandSheet.jsx';
import MixedHandsSheet from './MixedHandsSheet.jsx';
import RangeStats from './RangeStats.jsx';
import RangeInsights from './RangeInsights.jsx';
import RangeFullscreen from './RangeFullscreen.jsx';
import PracticeLink from './PracticeLink.jsx';
import './Ranges.css';

const ACE_ACE = 0; // the hand the desktop panel starts on

export default function Ranges() {
  const wide = useMediaQuery('(min-width: 1100px)');
  const { depth, chart, loading, error, retry, scenarios, scenario, grid, villain, variants, choose } = useRangeSpot();

  // The action filter belongs to the spot it was chosen in; the hand picked stays when the spot changes, so one hand
  // can be compared across spots.
  const [filter, setFilter] = useState({ spot: null, action: null });
  const highlight = scenario && filter.spot === scenario.id ? filter.action : null;
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [handSheet, setHandSheet] = useState(false);
  const [picker, setPicker] = useState(false);
  const [mixedSheet, setMixedSheet] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const setHighlight = (action) => setFilter({ spot: scenario.id, action });
  const chooseSpot = (spot) => choose({ spot: spot.id });
  // On phones a tapped cell opens its sheet; on desktop the panel is always there.
  const pickHand = (cls) => {
    setSelected(cls);
    if (!wide) setHandSheet(true);
  };
  const shownHand = wide ? (preview ?? selected ?? ACE_ACE) : selected;

  const header = (
    <PageHeader title="Ranges" subtitle="Solved 8-handed preflop charts. Tap a hand for the full story.">
      {grid && (
        <button type="button" className="ranges-fullscreen" onClick={() => setFullscreen(true)} aria-label="Full screen">
          <Icon name="expand" size={18} />
          <span className="ranges-fullscreen-label">Full screen</span>
        </button>
      )}
    </PageHeader>
  );
  const depthChips = <DepthChips depths={DEPTHS} value={depth} onChange={(next) => choose({ depth: next })} busy={loading} stacked={wide} />;

  // The chart isn't here yet (or can't be): the page frame with the depth, and the spinner or the error.
  if (!grid) {
    return (
      <div className="ranges">
        {header}
        <div className="ranges-loading">
          {depthChips}
          {error ? <LoadState error={error} onRetry={retry} /> : chart ? <LoadState error={new Error('This chart has no spots to show.')} /> : <LoadState />}
        </div>
      </div>
    );
  }

  const legend = <ActionLegend grid={grid} highlight={highlight} onHighlight={setHighlight} />;
  const stats = <RangeStats grid={grid} onMixed={() => setMixedSheet(true)} />;
  const variantChips = <VariantChips variants={variants} current={scenario} onSelect={chooseSpot} />;
  const insights = <RangeInsights grid={grid} villain={villain} scenarios={scenarios} onJump={chooseSpot} />;

  return (
    <div className={`ranges ${wide ? 'is-wide' : ''}`}>
      {header}

      {wide ? (
        <div className="ranges-wide">
          <aside className="ranges-side">
            {depthChips}
            <ScenarioList scenarios={scenarios} current={scenario} onSelect={chooseSpot} />
          </aside>

          <div className="ranges-content">
            <div className="ranges-headline">
              <h2 className="ranges-spot">{scenario.title}</h2>
              <p className="ranges-spot-sub">{scenario.subtitle}</p>
            </div>
            {variantChips}
            <div className="ranges-board-row">
              <div className="ranges-main">
                {legend}
                <div className="ranges-board">
                  <StrategyGrid
                    key={scenario.id}
                    grid={grid}
                    highlight={highlight}
                    selected={selected}
                    onSelect={pickHand}
                    onPreview={setPreview}
                    busy={loading}
                    label={`${scenario.title} range`}
                  />
                </div>
                <p className="ranges-hint">Hover a hand to preview it, click to keep it, or use the arrow keys. Click an action to see only where it is played.</p>
                {stats}
              </div>
              <div className="ranges-aside">
                <HandDetail grid={grid} cls={shownHand} variant="panel" />
              </div>
            </div>
            {insights}
          </div>
        </div>
      ) : (
        <div className="ranges-phone">
          <ScenarioSummary grid={grid} onOpen={() => setPicker(true)} />
          {depthChips}
          {variantChips}
          <div className="ranges-board">
            <StrategyGrid key={scenario.id} grid={grid} highlight={highlight} selected={selected} onSelect={pickHand} busy={loading} label={`${scenario.title} range`} />
          </div>
          {legend}
          <p className="ranges-hint">Tap a hand to see what to do with it. Tap an action to see only where it is played.</p>
          {stats}
          {insights}
          <PracticeLink scenario={scenario} />
        </div>
      )}

      {/* The spot sheet: the way to change spot on a phone, and from full screen on any screen */}
      <ScenarioPicker open={picker} onClose={() => setPicker(false)} scenarios={scenarios} current={scenario} onSelect={chooseSpot} />
      <HandSheet open={handSheet} onClose={() => setHandSheet(false)} grid={grid} cls={selected} onPick={setSelected} />
      <MixedHandsSheet
        open={mixedSheet}
        onClose={() => setMixedSheet(false)}
        grid={grid}
        onPick={(cls) => {
          setMixedSheet(false);
          pickHand(cls);
        }}
      />
      <RangeFullscreen
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        grid={grid}
        depth={depth}
        highlight={highlight}
        onHighlight={setHighlight}
        selected={selected}
        onSelect={setSelected}
        onDetails={() => setHandSheet(true)}
        onChangeSpot={() => setPicker(true)}
      />
    </div>
  );
}
