// One session from Game History (/history/:sessionId): its numbers, its grade (decisions from the hands you saved,
// money won, hours played) and the whole session in order, from sitting down to cashing out.
import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSession } from '../../api/sessions.js';
import { getHands } from '../../api/hands.js';
import { useApi } from '../../hooks/useApi.js';
import { isTournament, sessionProfit } from '../../utils/stats.js';
import { gradeSession } from '../../utils/sessionGrade.js';
import { formatDuration, formatLongDate, formatMoney, formatWeekday } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Money from '../../components/Money/Money.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import SessionGradeCard from './SessionGradeCard.jsx';
import SessionStory from './SessionStory.jsx';
import './SessionDetail.css';

// The page for the session in the URL (a new one loads fresh when the URL changes).
export default function SessionDetail() {
  const { sessionId } = useParams();
  return <SessionView key={sessionId} sessionId={sessionId} />;
}

function SessionView({ sessionId }) {
  const load = useCallback(() => Promise.all([getSession(sessionId), getHands()]), [sessionId]);
  const { data, error, reload } = useApi(load);
  if (!data) return <LoadState error={error} onRetry={reload} />;

  const [session, allHands] = data;
  const hands = allHands.filter((h) => h.sessionId === session.id);
  const grade = gradeSession(session, hands);
  const tournament = isTournament(session);
  const bb = tournament ? null : session.bigBlind;
  const money = (amount) => formatMoney(amount, { sign: false, bb });
  const profit = sessionProfit(session);
  const hours = session.durationMin / 60;
  const title = tournament ? `Tournament · ${session.game}` : `${session.game} ${session.stakes}`;

  return (
    <div className="session-detail">
      <PageHeader title={title} subtitle={`${formatWeekday(session.date)}, ${formatLongDate(session.date)} · ${session.venue} · ${formatDuration(session.durationMin)}`}>
        <Link to={`/history?open=${session.id}`} className="btn btn-ghost">
          <Icon name="chevronLeft" size={16} /> History
        </Link>
      </PageHeader>

      {/* The numbers */}
      <dl className="session-detail-stats">
        <div>
          <dt>Result</dt>
          <dd>
            <Money amount={profit} bb={bb} />
          </dd>
        </div>
        <div>
          <dt>Buy-in</dt>
          <dd className="num">{money(session.buyIn)}</dd>
        </div>
        <div>
          <dt>Cash-out</dt>
          <dd className="num">{money(session.cashOut)}</dd>
        </div>
        <div>
          <dt>{tournament ? 'Per hour' : 'Win rate'}</dt>
          <dd className="num">
            {tournament ? `${formatMoney(Math.round(profit / Math.max(hours, 0.25)))}/h` : `${(profit / session.bigBlind / Math.max(hours, 0.25)).toFixed(1)} bb/h`}
          </dd>
        </div>
        <div>
          <dt>Hands</dt>
          <dd className="num">
            {session.hands} played · {hands.length} saved
          </dd>
        </div>
      </dl>

      <div className="session-detail-columns">
        <div className="session-detail-side">
          <SessionGradeCard grade={grade} />
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
    </div>
  );
}
