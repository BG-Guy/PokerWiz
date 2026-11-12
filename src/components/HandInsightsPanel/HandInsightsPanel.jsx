// Insights about recorded hands: headline numbers, results by seat, verdicts, showdown split and findings.
// Shown on its own tab on phones and next to Highlights on desktop. Every box and every bar opens what's behind
// it in a sheet: the story of the number, or the hands of that seat, verdict or showdown split.
// Totals are in big blinds only when every hand was played at one big blind (handScope); otherwise dollars.
import { useMemo } from 'react';
import { handInsights } from '../../utils/handInsights.js';
import { handGroupDetail, handStatDetail } from '../../utils/handDetails.js';
import { handScope } from '../../utils/format.js';
import { useDetailView } from '../../hooks/useDetailView.js';
import { useUnit } from '../../theme/UnitContext.jsx';
import Panel from '../Panel/Panel.jsx';
import BarList from '../BarList/BarList.jsx';
import Money from '../Money/Money.jsx';
import StarRating from '../StarRating/StarRating.jsx';
import TiltFace from '../TiltMeter/TiltFace.jsx';
import Icon from '../Icon/Icon.jsx';
import DetailSheet from '../DetailSheet/DetailSheet.jsx';
import StatDetail from '../StatDetail/StatDetail.jsx';
import UnitNote from '../UnitNote/UnitNote.jsx';
import './HandInsightsPanel.css';

export default function HandInsightsPanel({ hands }) {
  const { unit } = useUnit();
  const detail = useDetailView();
  const scope = useMemo(() => handScope(hands), [hands, unit]);
  const insights = useMemo(() => handInsights(scope.hands, scope.money), [scope]);
  const money = (v) => scope.money.full(v);
  const groups = { seat: insights.byPosition, showdown: insights.byShowdown, verdict: insights.byVerdict };

  // What the open sheet shows: a box's story ("count"), or the hands of one bar ("seat:BB").
  const shownDetail = useMemo(() => {
    const key = detail.shownKey;
    if (!key) return null;
    const [kind, id] = key.split(':');
    if (!id) return handStatDetail(kind, scope);
    const group = groups[kind]?.find((item) => item.key === id);
    return group ? handGroupDetail(group, scope, kind) : null;
  }, [detail.shownKey, scope, insights]);

  const stats = [
    { id: 'count', label: 'Hands', value: <span className="num">{insights.count}</span> },
    { id: 'net', label: 'Net', value: <Money amount={insights.net} bb={scope.bb} /> },
    {
      id: 'rating',
      label: 'Avg rating',
      value:
        insights.avgRating != null ? (
          <span className="hand-insights-inline">
            <StarRating value={insights.avgRating} readOnly label="Average rating" />
            <span className="num">{insights.avgRating.toFixed(1)}</span>
          </span>
        ) : (
          '--'
        ),
    },
    {
      id: 'tilt',
      label: 'Avg tilt',
      value:
        insights.avgTilt != null ? (
          <span className="hand-insights-inline">
            <TiltFace level={Math.min(5, Math.max(1, Math.round(insights.avgTilt)))} size={20} />
            <span className="num">{insights.avgTilt.toFixed(1)}</span>
          </span>
        ) : (
          '--'
        ),
    },
  ];
  // A bar opens the hands behind it (nothing to open when there are no hands in it).
  const bars = (kind, items) => <BarList items={items} formatValue={kind === 'verdict' ? (v) => `${v}` : money} onOpen={(item) => item.hands.length > 0 && detail.open(`${kind}:${item.key}`)} />;

  return (
    <Panel title="Hand insights" className="hand-insights">
      {/* Headline numbers: tap one for its story */}
      <div className="hand-insights-stats">
        {stats.map((stat) => (
          <button key={stat.id} type="button" className="hand-insights-stat" onClick={() => detail.open(stat.id)} ref={detail.cardRef(stat.id)} disabled={insights.count === 0} aria-haspopup="dialog">
            <span className="hand-insights-stat-label">
              {stat.label} <Icon name="chevronRight" size={12} />
            </span>
            <span className="hand-insights-stat-value">{stat.value}</span>
          </button>
        ))}
      </div>
      <UnitNote scope={scope} />

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
          {bars('seat', insights.byPosition)}
        </>
      )}

      <h3 className="hand-insights-heading">Showdown or not</h3>
      {bars('showdown', insights.byShowdown)}

      {insights.byVerdict.length > 0 && (
        <>
          <h3 className="hand-insights-heading">Your verdicts</h3>
          {bars('verdict', insights.byVerdict)}
        </>
      )}
      {insights.count > 0 && <p className="hand-insights-hint">Tap a number or a bar to see the hands behind it.</p>}

      <DetailSheet open={detail.openKey !== null} onClose={detail.close} title={shownDetail?.title ?? ''} originRef={detail.originRef}>
        {shownDetail && <StatDetail detail={shownDetail} onNavigate={detail.close} />}
      </DetailSheet>
    </Panel>
  );
}
