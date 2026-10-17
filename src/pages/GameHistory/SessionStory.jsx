// The whole session, in order (Game History > a session): when it started and with what, every note, rebuy and
// saved hand (with its cards, result and grade), and how it ended. Hands saved from the session after it ended
// (not on its live timeline) come in at the time they were saved. Uses the live timeline's look.
import { Link } from 'react-router-dom';
import { isTournament, sessionProfit } from '../../utils/stats.js';
import { formatDuration, formatMoney, formatTime } from '../../utils/format.js';
import Money from '../../components/Money/Money.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import '../LiveSession/SessionTimeline.css';
import './SessionStory.css';

const ICONS = { start: 'play', note: 'note', rebuy: 'coins', hand: 'cards', end: 'flag' };

// Timeline entries: start, the session's events, its other saved hands, end; each { id, type, at, ... }.
function entriesOf(session, hands) {
  const byId = new Map(hands.map((h) => [h.id, h]));
  const onTimeline = new Set();
  const events = [];
  for (const e of session.events ?? []) {
    if (e.type === 'hand' && e.handId) {
      if (onTimeline.has(e.handId)) continue; // each hand once, even if it was logged twice
      onTimeline.add(e.handId);
    }
    events.push({ id: e.id, type: e.type, at: e.createdAt, text: e.text, amount: e.amount, hand: e.handId ? byId.get(e.handId) : null });
  }
  const later = hands.filter((h) => !onTimeline.has(h.id)).map((h) => ({ id: `hand-${h.id}`, type: 'hand', at: h.createdAt, text: h.title, amount: h.result, hand: h }));
  const middle = [...events, ...later].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return [
    { id: 'start', type: 'start', at: session.startedAt },
    ...middle,
    { id: 'end', type: 'end', at: session.endedAt },
  ];
}

export default function SessionStory({ session, hands }) {
  const bb = isTournament(session) ? null : session.bigBlind;
  const money = (amount) => formatMoney(amount, { sign: false, bb });
  const rebuys = (session.events ?? []).filter((e) => e.type === 'rebuy');
  const startedWith = session.buyIn - rebuys.reduce((sum, e) => sum + e.amount, 0);
  const startMs = session.startedAt ? Date.parse(session.startedAt) : null;
  let invested = startedWith;
  const entries = entriesOf(session, hands);

  return (
    <ol className="session-timeline session-story">
      {entries.map((entry) => {
        if (entry.type === 'rebuy') invested += entry.amount;
        const offset = startMs && entry.at && entry.type !== 'start' ? Math.round((Date.parse(entry.at) - startMs) / 60000) : null;
        return (
          <li key={entry.id} className={`session-timeline-item is-${entry.type === 'end' ? 'start' : entry.type}`}>
            <span className="session-timeline-icon">
              <Icon name={ICONS[entry.type]} size={16} />
            </span>
            <div className="session-timeline-body">
              <div className="session-timeline-meta">
                <span>{entry.type === 'start' ? 'Session started' : entry.type === 'end' ? 'Session ended' : ''}</span>
                {entry.at && <span>{formatTime(entry.at)}</span>}
                {offset !== null && offset >= 0 && <span className="session-timeline-offset">+{formatDuration(offset)}</span>}
              </div>

              {entry.type === 'start' && (
                <p className="session-timeline-text">
                  Sat down with <strong className="num">{money(startedWith)}</strong>
                  {!session.startedAt && <span className="session-story-muted"> (start time not recorded)</span>}
                </p>
              )}
              {entry.type === 'note' && <p className="session-timeline-text is-note">{entry.text}</p>}
              {entry.type === 'rebuy' && (
                <p className="session-timeline-text">
                  Rebuy <strong className="num">{money(entry.amount)}</strong>
                  <span className="session-story-muted"> · in for {money(invested)}</span>
                </p>
              )}
              {entry.type === 'hand' && (
                <Link to={entry.hand ? `/hands/${entry.hand.id}` : '/hands'} className="session-timeline-hand session-story-hand">
                  {entry.hand?.holeCards?.length > 0 && (
                    <span className="session-story-cards">
                      {entry.hand.holeCards.map((code) => (
                        <PlayingCard key={code} code={code} size="xs" />
                      ))}
                    </span>
                  )}
                  <span className="session-story-hand-text">
                    <span>{entry.hand?.title ?? entry.text}</span>
                    {(entry.hand?.coachAccuracy != null || entry.hand?.rating != null) && (
                      <span className="session-story-muted">
                        {entry.hand.coachAccuracy != null && `Coach ${entry.hand.coachAccuracy}%`}
                        {entry.hand.coachAccuracy != null && entry.hand.rating != null && ' · '}
                        {entry.hand.rating != null && `Your rating ${entry.hand.rating.toFixed(1)}`}
                      </span>
                    )}
                  </span>
                  {entry.amount != null && <Money amount={entry.amount} bb={bb} />}
                  <Icon name="chevronRight" size={16} />
                </Link>
              )}
              {entry.type === 'end' && (
                <p className="session-timeline-text">
                  Cashed out <strong className="num">{money(session.cashOut)}</strong> after {formatDuration(session.durationMin)} ·{' '}
                  <Money amount={sessionProfit(session)} bb={bb} />
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
