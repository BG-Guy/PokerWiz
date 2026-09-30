// Insights about recorded hands: headline numbers, results by seat, verdicts, showdown split and findings.
// Shown on its own tab on phones and next to Highlights on desktop.
import { handInsights } from '../../utils/handInsights.js';
import { formatUnits, handsForDisplay } from '../../utils/format.js';
import Panel from '../Panel/Panel.jsx';
import BarList from '../BarList/BarList.jsx';
import Money from '../Money/Money.jsx';
import StarRating from '../StarRating/StarRating.jsx';
import TiltFace from '../TiltMeter/TiltFace.jsx';
import Icon from '../Icon/Icon.jsx';
import './HandInsightsPanel.css';

export default function HandInsightsPanel({ hands }) {
  const insights = handInsights(handsForDisplay(hands)); // amounts in the BB/$ display unit
  const money = (v) => formatUnits(v, { whole: true });

  return (
    <Panel title="Hand insights" className="hand-insights">
      {/* Headline numbers */}
      <dl className="hand-insights-stats">
        <div>
          <dt>Hands</dt>
          <dd className="num">{insights.count}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>
            <Money amount={insights.net} bb={1} />
          </dd>
        </div>
        <div>
          <dt>Avg rating</dt>
          <dd>
            {insights.avgRating != null ? (
              <span className="hand-insights-inline">
                <StarRating value={insights.avgRating} readOnly label="Average rating" />
                <span className="num">{insights.avgRating.toFixed(1)}</span>
              </span>
            ) : (
              '--'
            )}
          </dd>
        </div>
        <div>
          <dt>Avg tilt</dt>
          <dd>
            {insights.avgTilt != null ? (
              <span className="hand-insights-inline">
                <TiltFace level={Math.min(5, Math.max(1, Math.round(insights.avgTilt)))} size={20} />
                <span className="num">{insights.avgTilt.toFixed(1)}</span>
              </span>
            ) : (
              '--'
            )}
          </dd>
        </div>
      </dl>

      {insights.notes.length > 0 && (
        <ul className="hand-insights-notes">
          {insights.notes.map((note) => (
            <li key={note}>
              <Icon name="bulb" size={16} />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      {insights.byPosition.length > 0 && (
        <>
          <h3 className="hand-insights-heading">Results by seat</h3>
          <BarList items={insights.byPosition} formatValue={money} />
        </>
      )}

      <h3 className="hand-insights-heading">Showdown or not</h3>
      <BarList items={insights.byShowdown} formatValue={money} />

      {insights.byVerdict.length > 0 && (
        <>
          <h3 className="hand-insights-heading">Your verdicts</h3>
          <BarList items={insights.byVerdict} formatValue={(v) => `${v}`} />
        </>
      )}
    </Panel>
  );
}
