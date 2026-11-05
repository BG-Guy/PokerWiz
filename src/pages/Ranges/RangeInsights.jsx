// The TLDR boxes under the grid: the opponent's range (or yours, when you open), the price of the spot, and the
// ranges written as text. Each is a short headline; a tap opens the sheet with the whole story.
import { useMemo } from 'react';
import TldrCard from '../../components/TldrCard/TldrCard.jsx';
import { CLASS_COMBOS, HAND_COUNT } from '../../gto/cards.js';
import { actionRangeText } from '../../gto/preflop/scenarioGrid.js';
import { percent } from './actionStyle.js';
import TheirRangeDetail from './TheirRangeDetail.jsx';
import SpotDetail from './SpotDetail.jsx';
import RangeTextDetail from './RangeTextDetail.jsx';
import './RangeInsights.css';

const bb = (x) => `${Number(x.toFixed(1))} bb`;

// grid: from buildGrid. villain: from villainRange (null when you open). scenarios: every spot of the chart, onJump:
// goes to another spot (the opponent's own decision, from the range sheet).
export default function RangeInsights({ grid, villain, scenarios, onJump }) {
  const { scenario } = grid;

  // Whose range the first box is about: the opponent's, or yours (the hands you play) when nobody acted before you.
  const range = useMemo(() => {
    if (villain) return { weights: villain.weights, who: villain.position, verb: scenario.villainVerb, share: villain.share, combos: villain.combos };
    const fold = grid.actions.findIndex((a) => a.family === 'fold');
    const weights = Float32Array.from(grid.cells, (cell) => (fold >= 0 ? 1 - cell.freq[fold] : 1));
    const combos = weights.reduce((sum, w, cls) => sum + CLASS_COMBOS[cls] * w, 0);
    return { weights, who: 'You', verb: 'play', share: combos / HAND_COUNT, combos };
  }, [grid, villain, scenario]);

  // The most aggressive action that is played at all, for the "as text" box.
  const lead = grid.actions[grid.order.find((a) => grid.actions[a].share >= 0.0005 && grid.actions[a].family !== 'fold') ?? grid.order[0]];
  const leadText = useMemo(() => actionRangeText(grid, lead.index).always, [grid, lead]);

  const facing = scenario.toCall > 0;
  const mine = range.who === 'You';
  const theirSpot = mine ? null : scenarios.find((s) => s.id === scenario.villainSpot);

  return (
    <div className="rg-insights">
      <TldrCard
        icon="users"
        label={mine ? 'Your range' : 'Their range'}
        value={percent(range.share, 1)}
        sentence={`${mine ? 'You play' : `${range.who} ${range.verb}`} ${Math.round(range.combos).toLocaleString('en-US')} of 1,326 hands.`}
        title={mine ? `Your range from ${scenario.position}` : `${range.who}'s range`}
        cta="See the range"
      >
        {(close) => (
          <TheirRangeDetail
            scenario={scenario}
            weights={range.weights}
            who={mine ? 'you' : range.who}
            verb={mine ? 'play' : range.verb}
            from={theirSpot && { spot: theirSpot, go: () => { close(); onJump(theirSpot); } }}
          />
        )}
      </TldrCard>

      <TldrCard
        icon="coins"
        label={facing ? 'The price' : 'The pot'}
        value={facing ? percent(scenario.potOdds) : bb(scenario.pot)}
        sentence={facing ? `Call ${bb(scenario.toCall)} to win ${bb(scenario.pot)}: you need ${percent(scenario.potOdds)} equity.` : `${bb(scenario.pot)} in the middle before you act.`}
        title="The price of the spot"
        cta="See the numbers"
      >
        <SpotDetail grid={grid} />
      </TldrCard>

      <TldrCard icon="note" label="As text" value={percent(lead.share, 1)} sentence={`${lead.short}: ${leadText || 'no hand takes it every time'}`} title="Ranges as text" cta="Copy the ranges">
        <RangeTextDetail grid={grid} />
      </TldrCard>
    </div>
  );
}
