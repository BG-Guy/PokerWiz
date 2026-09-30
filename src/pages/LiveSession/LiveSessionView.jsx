// The running session: live clock, quick actions (add hand, note, rebuy), the timeline, and Finish.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addSessionEvent, discardSession } from '../../api/sessions.js';
import { formatClock, formatMoney, formatTime } from '../../utils/format.js';
import Panel from '../../components/Panel/Panel.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import SessionTimeline from './SessionTimeline.jsx';
import FinishSessionSheet from './FinishSessionSheet.jsx';
import './LiveSessionView.css';

export default function LiveSessionView({ session, onChange, onFinished, onDiscarded }) {
  const [now, setNow] = useState(Date.now());
  const [composer, setComposer] = useState(null); // which inline form is open: 'note' | 'rebuy' | null
  const [noteText, setNoteText] = useState('');
  const [rebuyAmount, setRebuyAmount] = useState(String(session.bigBlind * 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [finishOpen, setFinishOpen] = useState(false);

  // Tick the session clock every second.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedMs = now - new Date(session.startedAt).getTime();
  const handCount = session.events.filter((e) => e.type === 'hand').length;
  // Hands dealt so far, at a live table's ~30 hands an hour.
  const handsDealt = Math.floor((elapsedMs / 3600000) * 30);
  const noteCount = session.events.filter((e) => e.type === 'note').length;

  const toggleComposer = (name) => {
    setError(null);
    setComposer((current) => (current === name ? null : name));
  };

  // Save a timeline entry, then close the inline form.
  const submitEvent = async (event) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await addSessionEvent(session.id, event));
      setComposer(null);
      setNoteText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm('Discard this session? Nothing from it will be saved.')) return;
    try {
      await discardSession(session.id);
      onDiscarded();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="live-view">
      <div className="live-view-main">
        {/* Header card on felt: status, stakes and the running clock */}
        <section className="live-view-hero">
          <span className="live-view-status">
            <span className="live-view-dot" aria-hidden="true" /> Live
          </span>
          <h1 className="live-view-title">
            {session.game} {session.stakes}
          </h1>
          <p className="live-view-subtitle">
            {session.venue} · started {formatTime(session.startedAt)}
          </p>
          <div className="live-view-clock num" role="timer" aria-label="Time played">
            {formatClock(elapsedMs)}
          </div>
          <dl className="live-view-numbers">
            <div>
              <dt>Buy-in</dt>
              <dd className="num">{formatMoney(session.buyIn, { sign: false, bb: session.bigBlind })}</dd>
            </div>
            <div>
              <dt>Hands dealt</dt>
              <dd className="num">~{handsDealt}</dd>
            </div>
            <div>
              <dt>Saved</dt>
              <dd className="num">{handCount}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd className="num">{noteCount}</dd>
            </div>
          </dl>
        </section>

        {/* Quick actions */}
        <div className="live-view-actions">
          <Link to={`/hands/new?session=${session.id}`} className="live-view-action">
            <Icon name="cards" size={22} />
            Add hand
          </Link>
          <button type="button" className={`live-view-action ${composer === 'note' ? 'is-active' : ''}`} onClick={() => toggleComposer('note')}>
            <Icon name="note" size={22} />
            Add note
          </button>
          <button type="button" className={`live-view-action ${composer === 'rebuy' ? 'is-active' : ''}`} onClick={() => toggleComposer('rebuy')}>
            <Icon name="coins" size={22} />
            Rebuy
          </button>
        </div>

        {/* Inline note form */}
        {composer === 'note' && (
          <form
            className="live-view-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitEvent({ type: 'note', text: noteText });
            }}
          >
            <textarea
              autoFocus
              rows={3}
              value={noteText}
              placeholder="Table dynamics, reads on players, how you feel..."
              aria-label="Note"
              onChange={(event) => setNoteText(event.target.value)}
            />
            <div className="live-view-composer-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setComposer(null)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy || !noteText.trim()}>
                Add to timeline
              </button>
            </div>
          </form>
        )}

        {/* Inline rebuy form */}
        {composer === 'rebuy' && (
          <form
            className="live-view-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitEvent({ type: 'rebuy', amount: Number(rebuyAmount) });
            }}
          >
            <label className="live-view-money">
              <span aria-hidden="true">$</span>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={rebuyAmount}
                aria-label="Rebuy amount in dollars"
                onChange={(event) => setRebuyAmount(event.target.value)}
              />
            </label>
            <div className="live-view-composer-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setComposer(null)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy || !(Number(rebuyAmount) > 0)}>
                Add rebuy
              </button>
            </div>
          </form>
        )}

        {error && (
          <p className="live-view-error" role="alert">
            {error}
          </p>
        )}

        <div className="live-view-footer">
          <button type="button" className="btn btn-ghost live-view-discard" onClick={handleDiscard}>
            <Icon name="trash" size={16} /> Discard
          </button>
          <button type="button" className="btn live-view-finish" onClick={() => setFinishOpen(true)}>
            <Icon name="flag" size={18} /> Finish session
          </button>
        </div>
      </div>

      <Panel title="Timeline" className="live-view-timeline">
        <SessionTimeline session={session} />
      </Panel>

      <FinishSessionSheet
        open={finishOpen}
        session={session}
        elapsedMs={elapsedMs}
        onClose={() => setFinishOpen(false)}
        onFinished={onFinished}
      />
    </div>
  );
}
