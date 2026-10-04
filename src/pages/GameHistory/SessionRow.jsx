// One session in Game History. Tapping it expands buy-in, cash-out, expenses, notes, a link to its hands, and
// Edit (change or delete the session). Tournaments have no big blind, so their amounts are always in dollars.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isTournament, sessionProfit } from '../../utils/stats.js';
import { formatDuration, formatMoney, formatUnits, formatWeekday, parseDate } from '../../utils/format.js';
import Money from '../../components/Money/Money.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import StarRating from '../../components/StarRating/StarRating.jsx';
import TiltMeter from '../../components/TiltMeter/TiltMeter.jsx';
import EditSessionSheet from './EditSessionSheet.jsx';
import './SessionRow.css';

// session is the display copy (BB/$ unit); rawSession is the saved one in dollars, which the edit sheet changes.
export default function SessionRow({ session, rawSession, handCount, isOpen, onToggle, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const tournament = isTournament(session);
  const unit = tournament ? null : 1; // cash games arrive converted to the BB/$ unit; tournaments stay in dollars
  const amount = (value, options) => formatMoney(value, { bb: unit, ...options });
  const profit = sessionProfit(session);
  const hourly = profit / (session.durationMin / 60);
  const detailsId = `session-details-${session.id}`;

  return (
    <li className={`session-row ${isOpen ? 'is-open' : ''}`}>
      {/* Summary line: date | game + venue | hands | result */}
      <button type="button" className="session-row-summary" onClick={onToggle} aria-expanded={isOpen} aria-controls={detailsId}>
        <span className="session-row-date">
          <span className="session-row-day num">{parseDate(session.date).getDate()}</span>
          <span className="session-row-weekday">{formatWeekday(session.date)}</span>
        </span>
        <span className="session-row-main">
          <span className="session-row-game">{tournament ? `Tournament · ${session.game}` : `${session.game} ${session.stakes}`}</span>
          <span className="session-row-meta">
            {session.venue} · {formatDuration(session.durationMin)}
          </span>
        </span>
        <span className="session-row-hands num">{session.hands} hands</span>
        <Money amount={profit} bb={unit} className="session-row-result" />
        <Icon name="chevronDown" size={18} className="session-row-chevron" />
      </button>

      {/* Expanded details */}
      {isOpen && (
        <div className="session-row-details" id={detailsId}>
          <dl className="session-row-stats">
            <div>
              <dt>Buy-in</dt>
              <dd className="num">{amount(session.buyIn, { sign: false })}</dd>
            </div>
            <div>
              <dt>Cash-out</dt>
              <dd className="num">{amount(session.cashOut, { sign: false })}</dd>
            </div>
            <div>
              <dt>Hourly</dt>
              <dd className="num">{tournament ? formatMoney(Math.round(hourly)) : formatUnits(hourly, { whole: true })}/h</dd>
            </div>
            {session.expenses > 0 && (
              <div>
                <dt>Expenses</dt>
                <dd className="num">{amount(session.expenses, { sign: false })}</dd>
              </div>
            )}
            {!tournament && (
              <div>
                <dt>Big blinds</dt>
                <dd className="num">{(profit / session.bigBlind).toFixed(0)} bb</dd>
              </div>
            )}
          </dl>

          {/* How the session felt: star rating and tilt level (recorded when finishing a live session) */}
          {(session.rating != null || session.tilt != null) && (
            <div className="session-row-feel">
              {session.rating != null && (
                <span className="session-row-feel-item">
                  <StarRating value={session.rating} readOnly label="Session rating" />
                  <span className="num">{session.rating.toFixed(1)}</span>
                </span>
              )}
              {session.tilt != null && (
                <span className="session-row-feel-item">
                  <span className="session-row-feel-label">Tilt</span>
                  <TiltMeter value={session.tilt} readOnly />
                </span>
              )}
            </div>
          )}

          {session.notes && <p className="session-row-notes">{session.notes}</p>}

          {/* Its hands, and editing the session */}
          <div className="session-row-actions">
            {handCount > 0 && (
              <Link to={`/hands?session=${session.id}`} className="btn session-row-link">
                Review {handCount} saved {handCount === 1 ? 'hand' : 'hands'}
                <Icon name="chevronRight" size={16} />
              </Link>
            )}
            <button type="button" className="btn btn-ghost session-row-edit" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={16} /> Edit session
            </button>
          </div>
        </div>
      )}

      {editing && (
        <EditSessionSheet
          session={rawSession}
          handCount={handCount}
          open
          onClose={() => setEditing(false)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </li>
  );
}
