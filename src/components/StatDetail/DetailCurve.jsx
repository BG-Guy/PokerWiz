// The small curve in a detail (your bankroll, the stretch since your peak). When the detail says what's behind it
// (section.chart: the sessions), a Full screen button opens the real graph: on its side on a phone, a dot for
// every session, each dot telling that session's story. The full-screen view lives in the address (?view=curve)
// while it's open, so Back closes it and lands on the sheet again.
import { formatDate } from '../../utils/format.js';
import { useUrlFlag } from '../../hooks/useUrlFlag.js';
import Icon from '../Icon/Icon.jsx';
import LineChart from '../LineChart/LineChart.jsx';
import BankrollFullscreen from '../BankrollFullscreen/BankrollFullscreen.jsx';

// section: { title, data, tone, chart?: { sessions, downswings } }. money: the formatters for the detail's unit.
export default function DetailCurve({ section, money }) {
  const fullscreen = useUrlFlag('view', 'curve');
  const { chart } = section;
  return (
    <>
      <div className="stat-detail-curve-head">
        {section.title && <h3 className="stat-detail-title">{section.title}</h3>}
        {chart && (
          <button type="button" className="stat-detail-fullscreen" onClick={fullscreen.open} aria-label={`Open ${section.title ?? 'the chart'} full screen`}>
            <Icon name="expand" size={15} /> Full screen
          </button>
        )}
      </div>
      <LineChart data={section.data} height={140} tone={section.tone} formatValue={(v) => money.compact(v)} formatLabel={(label) => (label ? formatDate(label) : '')} />
      {chart && (
        <BankrollFullscreen
          open={fullscreen.here}
          onClose={fullscreen.close}
          sessions={chart.sessions}
          money={money}
          scope="Cash games"
          showDownswings={Boolean(chart.downswings)}
          showMarkers={Boolean(chart.downswings)}
        />
      )}
    </>
  );
}
