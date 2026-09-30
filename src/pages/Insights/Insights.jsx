// Insights page: leaks and strengths plus hourly breakdowns, all computed from your finished sessions
// (venue, stakes, game, weekday, tilt). Stats that need a hand tracker (VPIP and friends) aren't shown.
import { getSessions } from '../../api/sessions.js';
import { useApi } from '../../hooks/useApi.js';
import { summarize, hourlyBy } from '../../utils/stats.js';
import { sessionFindings, hourlyByWeekday, resultsByTilt } from '../../utils/sessionInsights.js';
import { formatUnits, sessionsForDisplay } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import StatCard from '../../components/StatCard/StatCard.jsx';
import Panel from '../../components/Panel/Panel.jsx';
import BarList from '../../components/BarList/BarList.jsx';
import LeakCard from './LeakCard.jsx';
import './Insights.css';

export default function Insights() {
  const { data, error, reload } = useApi(getSessions);
  const sessions = data && sessionsForDisplay(data); // amounts in the BB/$ display unit
  if (!sessions) return <LoadState error={error} onRetry={reload} />;
  if (sessions.length === 0) return <LoadState error={new Error('Finish a session to unlock insights.')} />;

  const summary = summarize(sessions);
  const byVenue = hourlyBy(sessions, 'venue');
  const byStakes = hourlyBy(sessions, 'stakes');
  const byGame = hourlyBy(sessions, 'game');
  const byWeekday = hourlyByWeekday(sessions);
  const byTilt = resultsByTilt(sessions);
  const findings = sessionFindings(sessions);
  const perHour = (value) => `${formatUnits(value, { whole: true })}/h`;

  return (
    <div className="insights">
      <PageHeader title="Insights" subtitle="What your sessions say, and what to work on next." />

      {/* Headline numbers */}
      <div className="insights-stats">
        <StatCard label="Win rate" value={`${summary.bbPer100.toFixed(1)} bb/100`} hint={`${summary.hands.toLocaleString('en-US')} hands`} icon="chart" />
        <StatCard label="Hourly" value={perHour(summary.hourly)} hint={`${Math.round(summary.hours)} hours`} icon="clock" />
        <StatCard label="Best venue" value={byVenue[0].label} hint={perHour(byVenue[0].value)} icon="flag" />
        <StatCard label="Best stakes" value={byStakes[0].label} hint={perHour(byStakes[0].value)} icon="trendUp" />
      </div>

      {/* Leaks first: they're the most actionable part of the page */}
      <Panel title="Leaks and strengths" className="insights-leaks">
        {findings.length === 0 ? (
          <p className="insights-empty">Play a few more sessions (and rate your tilt) to surface patterns.</p>
        ) : (
          <ul className="insights-leak-list">
            {findings.map((finding) => (
              <LeakCard key={finding.id} leak={finding} />
            ))}
          </ul>
        )}
      </Panel>

      {/* Where the money comes from */}
      <div className="insights-breakdowns">
        <Panel title="Hourly by venue">
          <BarList items={byVenue} formatValue={perHour} />
        </Panel>
        <Panel title="Hourly by stakes">
          <BarList items={byStakes} formatValue={perHour} />
        </Panel>
        <Panel title="Hourly by game">
          <BarList items={byGame} formatValue={perHour} />
        </Panel>
        <Panel title="Hourly by day">
          <BarList items={byWeekday} formatValue={perHour} />
        </Panel>
        <Panel title="Results by tilt level">
          {byTilt.length ? (
            <BarList items={byTilt} formatValue={(v) => formatUnits(v, { whole: true })} />
          ) : (
            <p className="insights-empty">Rate your tilt when you finish a session to see how it affects results.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
