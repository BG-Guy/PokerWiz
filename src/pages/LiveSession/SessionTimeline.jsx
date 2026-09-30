// Chronological timeline of a live session: start, then every note, rebuy and saved hand in order.
import { Link } from 'react-router-dom';
import { formatDuration, formatMoney, formatTime } from '../../utils/format.js';
import Money from '../../components/Money/Money.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './SessionTimeline.css';

const EVENT_ICONS = { start: 'play', note: 'note', rebuy: 'coins', hand: 'cards' };

// Body of one entry, depending on its type.
function EntryContent({ entry, initialBuyIn }) {
  if (entry.type === 'start') {
    return (
      <p className="session-timeline-text">
        Sat down with <strong className="num">{formatMoney(initialBuyIn, { sign: false })}</strong>
      </p>
    );
  }
  if (entry.type === 'note') return <p className="session-timeline-text is-note">{entry.text}</p>;
  if (entry.type === 'rebuy') {
    return (
      <p className="session-timeline-text">
        Rebuy <strong className="num">{formatMoney(entry.amount, { sign: false })}</strong>
      </p>
    );
  }
  // Saved hand: links to the review page
  return (
    <Link to={`/hands/${entry.handId}`} className="session-timeline-hand">
      <span>{entry.text}</span>
      {entry.amount != null && <Money amount={entry.amount} />}
      <Icon name="chevronRight" size={16} />
    </Link>
  );
}

export default function SessionTimeline({ session }) {
  const startMs = new Date(session.startedAt).getTime();
  const rebuyTotal = session.events.filter((e) => e.type === 'rebuy').reduce((sum, e) => sum + e.amount, 0);
  const entries = [{ id: 'start', type: 'start', createdAt: session.startedAt }, ...session.events];

  return (
    <div className="session-timeline-wrap">
      <ol className="session-timeline">
        {entries.map((entry) => (
          <li key={entry.id} className={`session-timeline-item is-${entry.type}`}>
            <span className="session-timeline-icon">
              <Icon name={EVENT_ICONS[entry.type]} size={16} />
            </span>
            <div className="session-timeline-body">
              <div className="session-timeline-meta">
                <span>{entry.type === 'start' ? 'Session started' : formatTime(entry.createdAt)}</span>
                {entry.type !== 'start' && (
                  <span className="session-timeline-offset">
                    +{formatDuration(Math.round((new Date(entry.createdAt).getTime() - startMs) / 60000))}
                  </span>
                )}
              </div>
              <EntryContent entry={entry} initialBuyIn={session.buyIn - rebuyTotal} />
            </div>
          </li>
        ))}
      </ol>

      {session.events.length === 0 && (
        <p className="session-timeline-empty">Hands, notes and rebuys you add show up here, in order.</p>
      )}
    </div>
  );
}
