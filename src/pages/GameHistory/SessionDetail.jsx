// One session from Game History (/history/:sessionId): its numbers, its grade (decisions from the hands you saved,
// money won, hours played) and the whole session in order, from sitting down to cashing out. Each number and
// the grade open their story in a sheet.
import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSession, getSessions } from '../../api/sessions.js';
import { getHands } from '../../api/hands.js';
import { useApi } from '../../hooks/useApi.js';
import { useDetailView } from '../../hooks/useDetailView.js';
import { useUnit } from '../../theme/UnitContext.jsx';
import { isTournament, sessionProfit } from '../../utils/stats.js';
import { gradeSession } from '../../utils/sessionGrade.js';
import { sessionDetail } from '../../utils/sessionDetails.js';
import { formatDuration, formatLongDate, formatMoney, formatWeekday } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Money from '../../components/Money/Money.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import DetailSheet from '../../components/DetailSheet/DetailSheet.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import SessionGradeCard from './SessionGradeCard.jsx';
import SessionStory from './SessionStory.jsx';
import './SessionDetail.css';

// The page for the session in the URL (a new one loads fresh when the URL changes).
export default function SessionDetail() {
  const { sessionId } = useParams();
  return <SessionView key={sessionId} sessionId={sessionId} />;
}

function SessionView({ sessionId }) {
  const load = useCallback(() => Promise.all([getSession(sessionId), getHands(), getSessions()]), [sessionId]);
  const { data, error, reload } = useApi(load);
  const detail = useDetailView();
  useUnit(); // the amounts follow the BB/$ switch
  if (!data) return <LoadState error={error} onRetry={reload} />;

  const [session, allHands, allSessions] = data;
  const hands = allHands.filter((h) => h.sessionId === session.id);
  const grade = gradeSession(session, hands);
  const tournament = isTournament(session);
  const bb = tournament ? null : session.bigBlind;
  const money = (amount) => formatMoney(amount, { sign: false, bb });
  const profit = sessionProfit(session);
  const hours = session.durationMin / 60;
  const title = tournament ? `Tournament · ${session.game}` : `${session.game} ${session.stakes}`;
  const stats = [
    { id: 'result', label: 'Result', value: <Money amount={profit} bb={bb} /> },
    { id: 'buyin', label: 'Buy-in', value: money(session.buyIn) },
    { id: 'cashout', label: 'Cash-out', value: money(session.cashOut) },
    {
      id: 'rate',
      label: tournament ? 'Per hour' : 'Win rate',
      value: tournament ? `${formatMoney(Math.round(profit / Math.max(hours, 0.25)))}/h` : `${(profit / session.bigBlind / Math.max(hours, 0.25)).toFixed(1)} bb/h`,
    },
    { id: 'hands', label: 'Hands', value: `${session.hands} played · ${hands.length} saved` },
  ];
  const shownDetail = detail.shownKey ? sessionDetail(detail.shownKey, session, { hands, sessions: allSessions }) : null;

  return (
    <div className="session-detail">
      <PageHeader title={title} subtitle={`${formatWeekday(session.date)}, ${formatLongDate(session.date)} · ${session.venue} · ${formatDuration(session.durationMin)}`}>
        <Link to={`/history?open=${session.id}`} className="btn btn-ghost">
          <Icon name="chevronLeft" size={16} /> History
        </Link>
      </PageHeader>

      {/* The numbers: tap one for its story */}
      <div className="session-detail-stats">
        {stats.map((stat) => (
          <button key={stat.id} type="button" className="session-detail-stat" onClick={() => detail.open(stat.id)} ref={detail.cardRef(stat.id)} aria-haspopup="dialog">
            <span className="session-detail-stat-label">
              {stat.label} <Icon name="chevronRight" size={13} />
            </span>
            <span className="session-detail-stat-value num">{stat.value}</span>
          </button>
        ))}
      </div>

      <div className="session-detail-columns">
        <div className="session-detail-side">
          <SessionGradeCard grade={grade} onOpen={() => detail.open('grade')} ref={detail.cardRef('grade')} />
          {session.notes && (
            <section className="session-detail-notes">
              <h2>Notes</h2>
              <p>{session.notes}</p>
            </section>
          )}
        </div>

        <section className="session-detail-story">
          <h2>The whole session</h2>
          <SessionStory session={session} hands={hands} />
          {(session.events ?? []).length === 0 && hands.length === 0 && (
            <p className="session-detail-empty">
              Nothing was recorded during this session. Start a live session next time (Log session) to note rebuys, thoughts and hands as
              they happen.
            </p>
          )}
        </section>
      </div>

      <DetailSheet open={detail.openKey !== null} onClose={detail.close} title={shownDetail?.title ?? ''} originRef={detail.originRef}>
        {shownDetail && <StatDetail detail={shownDetail} />}
      </DetailSheet>
    </div>
  );
}
