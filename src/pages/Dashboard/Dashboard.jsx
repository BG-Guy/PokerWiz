// Dashboard (home): live-session banner, headline stats, bankroll curve, goal snapshot,
// recent sessions and a hand to review.
import { Link } from 'react-router-dom';
import { getSessions, getLiveSession } from '../../api/sessions.js';
import { getHands } from '../../api/hands.js';
import { getGoals } from '../../api/goals.js';
import { useApi } from '../../hooks/useApi.js';
import { summarize, cumulativeProfit, newestFirst, sessionProfit } from '../../utils/stats.js';
import { analyzeGoal, statusTone, GOAL_STATUS } from '../../utils/goalInsights.js';
import { formatMoney, formatDate, formatDuration, formatWeekday, todayIso } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import StatCard from '../../components/StatCard/StatCard.jsx';
import Panel from '../../components/Panel/Panel.jsx';
import BankrollChart from '../../components/BankrollChart/BankrollChart.jsx';
import ProgressBar from '../../components/ProgressBar/ProgressBar.jsx';
import Money from '../../components/Money/Money.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import VerdictBadge from '../../components/VerdictBadge/VerdictBadge.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import LiveSessionBanner from './LiveSessionBanner.jsx';
import HighlightsPreview from './HighlightsPreview.jsx';
import './Dashboard.css';

const loadDashboard = () => Promise.all([getSessions(), getHands(), getGoals(), getLiveSession()]);

export default function Dashboard() {
  const { data, error, reload } = useApi(loadDashboard);
  if (!data) return <LoadState error={error} onRetry={reload} />;

  // Derived data for each dashboard block.
  const [sessions, hands, goals, liveSession] = data;
  const summary = summarize(sessions);
  const bankroll = cumulativeProfit(sessions);
  const recentSessions = newestFirst(sessions).slice(0, 4);
  const handToReview = hands.find((hand) => hand.verdict === 'review') ?? hands[0];
  const today = todayIso();
  const goalPreview = goals.slice(0, 3).map((goal) => ({ goal, analysis: analyzeGoal(goal, today) }));
  const subtitle = sessions.length
    ? `${summary.count} sessions since ${formatDate(bankroll[0].label)}. Here is how you are running.`
    : 'Start your first session to see your numbers here.';

  return (
    <div className="dashboard">
      <PageHeader title="Welcome back" subtitle={subtitle}>
        {!liveSession && (
          <Link to="/session" className="btn">
            <Icon name="play" size={16} /> Start session
          </Link>
        )}
      </PageHeader>

      {liveSession && <LiveSessionBanner session={liveSession} />}

      {/* Headline numbers */}
      <div className="dashboard-stats">
        <StatCard
          label="Net profit"
          value={formatMoney(summary.net)}
          tone={summary.net >= 0 ? 'positive' : 'negative'}
          hint={`${summary.count} sessions`}
          icon="trendUp"
        />
        <StatCard label="Hourly" value={`${formatMoney(Math.round(summary.hourly))}/h`} hint={`${Math.round(summary.hours)} hours played`} icon="clock" />
        <StatCard label="Win rate" value={`${summary.bbPer100.toFixed(1)} bb/100`} hint={`${summary.hands.toLocaleString('en-US')} hands`} icon="chart" />
        <StatCard
          label="Winning sessions"
          value={`${Math.round(summary.winningShare * 100)}%`}
          hint={`${summary.winning} of ${summary.count}`}
          icon="flag"
        />
      </div>

      <div className="dashboard-grid">
        {/* Bankroll curve */}
        <Panel
          title="Bankroll"
          className="dashboard-bankroll"
          action={
            <Link to="/insights" className="btn btn-ghost">
              Insights
            </Link>
          }
        >
          {bankroll.length > 0 ? (
            <BankrollChart sessions={sessions} />
          ) : (
            <p className="dashboard-empty">No finished sessions yet.</p>
          )}
        </Panel>

        {/* Goal snapshot: progress bar with a tick showing where you should be by now */}
        <Panel
          title="Goals"
          className="dashboard-goals"
          action={
            <Link to="/goals" className="btn btn-ghost">
              All goals
            </Link>
          }
        >
          <ul className="dashboard-goal-list">
            {goalPreview.map(({ goal, analysis }) => (
              <li key={goal.id} className="dashboard-goal">
                <div className="dashboard-goal-top">
                  <span className="dashboard-goal-title">{goal.title}</span>
                  <span className="dashboard-goal-pct num">{Math.round(analysis.progress * 100)}%</span>
                </div>
                <ProgressBar value={analysis.progress} marker={analysis.timeShare} tone={statusTone(analysis.status)} label={goal.title} />
                <span className={`dashboard-goal-status is-${analysis.status}`}>{GOAL_STATUS[analysis.status]}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Latest sessions */}
        <Panel
          title="Recent sessions"
          className="dashboard-recent"
          action={
            <Link to="/history" className="btn btn-ghost">
              History
            </Link>
          }
        >
          <ul className="dashboard-session-list">
            {recentSessions.map((session) => (
              <li key={session.id} className="dashboard-session">
                <span className="dashboard-session-date">
                  <span className="num">{formatDate(session.date)}</span>
                  <span>{formatWeekday(session.date)}</span>
                </span>
                <span className="dashboard-session-main">
                  <span className="dashboard-session-game">
                    {session.game} {session.stakes}
                  </span>
                  <span className="dashboard-session-meta">
                    {session.venue} · {formatDuration(session.durationMin)}
                  </span>
                </span>
                <Money amount={sessionProfit(session)} />
              </li>
            ))}
          </ul>
        </Panel>

        {/* Top hand from a few highlight awards */}
        <HighlightsPreview hands={hands} />

        {/* One hand flagged for review, shown on a felt background */}
        {handToReview && (
          <Panel title="Hand to review" className="dashboard-hand">
            <Link to={`/hands/${handToReview.id}`} className="dashboard-hand-card">
              <div className="dashboard-hand-cards">
                {handToReview.holeCards.map((code) => (
                  <PlayingCard key={code} code={code} />
                ))}
              </div>
              <div className="dashboard-hand-info">
                <VerdictBadge verdict={handToReview.verdict} />
                <span className="dashboard-hand-title">{handToReview.title}</span>
                <span className="dashboard-hand-meta">
                  {formatDate(handToReview.date)} · {handToReview.heroPosition} · {handToReview.stakes}
                </span>
              </div>
              <span className="dashboard-hand-cta">
                Open hand <Icon name="chevronRight" size={16} />
              </span>
            </Link>
          </Panel>
        )}
      </div>
    </div>
  );
}
