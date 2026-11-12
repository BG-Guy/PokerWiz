// Dashboard (home): live-session banner, headline stats, bankroll curve, goal snapshot, recent sessions and a hand
// to review. Every box and row opens its short version in a sheet (a stat's story, a goal's pace, a session),
// with the way on to its full page.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, getLiveSession } from '../../api/sessions.js';
import { getHands } from '../../api/hands.js';
import { getGoals } from '../../api/goals.js';
import { useApi } from '../../hooks/useApi.js';
import { useDetailView } from '../../hooks/useDetailView.js';
import { useUnit } from '../../theme/UnitContext.jsx';
import { statDetail } from '../../utils/insightDetails.js';
import { sessionSummary } from '../../utils/sessionDetails.js';
import { goalDetail } from '../../utils/goalDetails.js';
import { summarize, cumulativeProfit, newestFirst, sessionProfit, cashGames } from '../../utils/stats.js';
import { analyzeGoal, statusTone, GOAL_STATUS } from '../../utils/goalInsights.js';
import { formatDate, formatDuration, formatWeekday, moneyScope, todayIso } from '../../utils/format.js';
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
import DetailSheet from '../../components/DetailSheet/DetailSheet.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import UnitNote from '../../components/UnitNote/UnitNote.jsx';
import LiveSessionBanner from './LiveSessionBanner.jsx';
import HighlightsPreview from './HighlightsPreview.jsx';
import StudyPanel from './StudyPanel.jsx';
import './Dashboard.css';

const loadDashboard = () => Promise.all([getSessions(), getHands(), getGoals(), getLiveSession()]);

export default function Dashboard() {
  const { data, error, reload } = useApi(loadDashboard);
  const detail = useDetailView();
  const { unit } = useUnit();
  const today = todayIso();
  // Cash games (tournaments have no big blind), in the unit their totals can be shown in.
  const scope = useMemo(() => data && moneyScope(cashGames(data[0])), [data, unit]);
  // What the open sheet shows (built only when one is open): a stat's story, a session, or a goal.
  const shownDetail = useMemo(() => {
    const key = detail.shownKey;
    if (!data || !key) return null;
    const [sessions, hands, goals] = data;
    if (key.startsWith('session:')) {
      const session = sessions.find((s) => `session:${s.id}` === key);
      return session ? sessionSummary(session, hands.filter((h) => h.sessionId === session.id)) : null;
    }
    if (key.startsWith('goal:')) {
      const goal = goals.find((g) => `goal:${g.id}` === key);
      return goal ? goalDetail(goal, today) : null;
    }
    return statDetail(key, scope);
  }, [data, scope, detail.shownKey, today, unit]);
  if (!data) return <LoadState error={error} onRetry={reload} />;

  // Derived data for each dashboard block.
  const [rawSessions, hands, goals, liveSession] = data;
  const { sessions, money } = scope;
  const summary = summarize(sessions);
  const bankroll = cumulativeProfit(sessions);
  const recentSessions = newestFirst(cashGames(rawSessions)).slice(0, 4);
  const handToReview = hands.find((hand) => hand.verdict === 'review') ?? hands[0];
  const goalPreview = goals.slice(0, 3).map((goal) => ({ goal, analysis: analyzeGoal(goal, today) }));
  const stats = [
    { id: 'net', label: 'Net profit', value: money.full(summary.net), tone: summary.net >= 0 ? 'positive' : 'negative', hint: `${summary.count} sessions`, icon: 'trendUp' },
    { id: 'hourly', label: 'Hourly', value: `${money.full(summary.hourly)}/h`, hint: `${Math.round(summary.hours)} hours played`, icon: 'clock' },
    { id: 'winrate', label: 'Win rate', value: `${summary.bbPer100.toFixed(1)} bb/100`, hint: `${summary.hands.toLocaleString('en-US')} hands`, icon: 'chart' },
    { id: 'winning', label: 'Winning sessions', value: `${Math.round(summary.winningShare * 100)}%`, hint: `${summary.winning} of ${summary.count}`, icon: 'flag' },
  ];
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

      {/* Headline numbers: tap or click one for the full story */}
      <div className="dashboard-stats">
        {stats.map(({ id, ...stat }) => (
          <StatCard key={id} {...stat} ref={detail.cardRef(id)} onOpen={sessions.length ? () => detail.open(id) : undefined} />
        ))}
      </div>
      <UnitNote scope={scope} className="dashboard-unit-note" />

      <div className="dashboard-grid">
        {/* Study: your biggest leak, a drill for it, and the range charts */}
        <StudyPanel hands={hands} />

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
            <BankrollChart sessions={rawSessions} />
          ) : (
            <p className="dashboard-empty">No finished sessions yet.</p>
          )}
        </Panel>

        {/* Goal snapshot: progress bar with a tick showing where you should be by now. A goal opens its pace. */}
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
              <li key={goal.id}>
                <button type="button" className="dashboard-goal" onClick={() => detail.open(`goal:${goal.id}`)} ref={detail.cardRef(`goal:${goal.id}`)} aria-haspopup="dialog">
                  <span className="dashboard-goal-top">
                    <span className="dashboard-goal-title">{goal.title}</span>
                    <span className="dashboard-goal-pct num">{Math.round(analysis.progress * 100)}%</span>
                  </span>
                  <ProgressBar value={analysis.progress} marker={analysis.timeShare} tone={statusTone(analysis.status)} label={goal.title} />
                  <span className="dashboard-goal-foot">
                    <span className={`dashboard-goal-status is-${analysis.status}`}>{GOAL_STATUS[analysis.status]}</span>
                    <span className="dashboard-row-more">
                      Pace <Icon name="chevronRight" size={14} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Latest sessions: each opens its short version, with the way to the whole session */}
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
              <li key={session.id}>
                <button type="button" className="dashboard-session" onClick={() => detail.open(`session:${session.id}`)} ref={detail.cardRef(`session:${session.id}`)} aria-haspopup="dialog">
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
                  {/* One session, one big blind: its own result follows the BB/$ switch */}
                  <Money amount={sessionProfit(session)} bb={session.bigBlind} />
                  <Icon name="chevronRight" size={16} className="dashboard-session-chevron" />
                </button>
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

      <DetailSheet open={detail.openKey !== null} onClose={detail.close} title={shownDetail?.title ?? ''} originRef={detail.originRef}>
        {shownDetail && <StatDetail detail={shownDetail} />}
      </DetailSheet>
    </div>
  );
}
