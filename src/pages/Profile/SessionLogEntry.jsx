// One session in the profile's log, with every detail: the day and start time, cash game or tournament, the
// game and blinds (and ante), location, length and hands, buy-in, cash-out, expenses, the result (also in big
// blinds for cash games), hourly rate, how it felt (if rated), where it came from, and the notes in full.
// Money is shown in dollars, as it was recorded.
import { isTournament, sessionProfit } from '../../utils/stats.js';
import { formatDuration, formatMoney, parseDate } from '../../utils/format.js';
import Money from '../../components/Money/Money.jsx';
import './SessionLogEntry.css';

const dollars = (amount) => formatMoney(amount, { sign: false });
const SOURCES = { regroup: 'Imported from Regroup' };

// "+21 bb" / "-233.3 bb" (one decimal under 100 bb).
function bigBlinds(amount, bb) {
  const value = Math.abs(amount / bb);
  const text = value >= 100 ? Math.round(value).toLocaleString('en-US') : String(Math.round(value * 10) / 10);
  return `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${text} bb`;
}

export default function SessionLogEntry({ session }) {
  const tournament = isTournament(session);
  const profit = sessionProfit(session);
  const hours = session.durationMin / 60;
  const started = session.startedAt ? new Date(session.startedAt) : null;
  const day = parseDate(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = started?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <li className={`session-entry ${tournament ? 'is-tournament' : ''}`}>
      {/* When, and the result */}
      <div className="session-entry-head">
        <div className="session-entry-when">
          <span className="session-entry-day">{day}</span>
          {time && <span className="session-entry-time">started {time}</span>}
        </div>
        <div className="session-entry-result">
          <Money amount={profit} />
          {!tournament && session.bigBlind > 0 && <span className="session-entry-bb num">{bigBlinds(profit, session.bigBlind)}</span>}
        </div>
      </div>

      {/* What and where */}
      <ul className="session-entry-tags">
        <li className="session-entry-format">{tournament ? 'Tournament' : 'Cash game'}</li>
        <li>
          {session.game}
          {!tournament && ` ${session.stakes}`}
          {session.ante > 0 && ` · ante ${dollars(session.ante)}`}
        </li>
        <li>{session.venue}</li>
        <li className="num">
          {formatDuration(session.durationMin)} · about {session.hands.toLocaleString('en-US')} hands
        </li>
        {SOURCES[session.source] && <li className="session-entry-source">{SOURCES[session.source]}</li>}
      </ul>

      {/* The money, as recorded */}
      <dl className="session-entry-money">
        <div>
          <dt>Buy-in</dt>
          <dd className="num">{dollars(session.buyIn)}</dd>
        </div>
        <div>
          <dt>Cash-out</dt>
          <dd className="num">{dollars(session.cashOut ?? 0)}</dd>
        </div>
        <div>
          <dt>Expenses</dt>
          <dd className="num">{dollars(session.expenses ?? 0)}</dd>
        </div>
        <div>
          <dt>Hourly</dt>
          <dd className="num">{hours > 0 ? `${formatMoney(Math.round(profit / hours))}/h` : '-'}</dd>
        </div>
      </dl>

      {/* How it felt, for sessions finished in the app */}
      {(session.rating != null || session.tilt != null) && (
        <p className="session-entry-feel">
          {session.rating != null && `Rated ${session.rating.toFixed(1)} of 5`}
          {session.rating != null && session.tilt != null && ' · '}
          {session.tilt != null && `Tilt ${session.tilt} of 5`}
        </p>
      )}

      {/* Notes in full, line breaks kept */}
      {session.notes ? <p className="session-entry-notes">{session.notes}</p> : <p className="session-entry-notes is-empty">No notes.</p>}
    </li>
  );
}
