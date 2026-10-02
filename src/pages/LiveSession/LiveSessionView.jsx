// The running session: live clock, quick actions (add hand, note), the editable timeline, Edit (or discard) and Finish.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addSessionEvent } from '../../api/sessions.js';
import { formatClock, formatMoney, formatTime } from '../../utils/format.js';
import Panel from '../../components/Panel/Panel.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import SessionTimeline from './SessionTimeline.jsx';
import FinishSessionSheet from './FinishSessionSheet.jsx';
import EditSessionSheet from '../../components/EditSessionSheet/EditSessionSheet.jsx';
import './LiveSessionView.css';

export default function LiveSessionView({ session, onChange, onFinished, onDiscarded }) {
  const [now, setNow] = useState(Date.now());
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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

  const toggleNote = () => {
    setError(null);
    setNoteOpen((open) => !open);
  };

  // Save a timeline entry, then close the inline form.
  const submitEvent = async (event) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await addSessionEvent(session.id, event));
      setNoteOpen(false);
      setNoteText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
              <dd>
                {/* Tap the buy-in to change it (e.g. after topping up) */}
                <button type="button" className="live-view-buyin num" onClick={() => setEditOpen(true)} aria-label="Edit buy-in">
                  {formatMoney(session.buyIn, { sign: false, bb: session.bigBlind })}
                  <Icon name="pencil" size={14} />
                </button>
              </dd>
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
          <button type="button" className={`live-view-action ${noteOpen ? 'is-active' : ''}`} onClick={toggleNote}>
            <Icon name="note" size={22} />
            Add note
          </button>
        </div>

        {/* Inline note form */}
        {noteOpen && (
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
              <button type="button" className="btn btn-ghost" onClick={() => setNoteOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy || !noteText.trim()}>
                Add to timeline
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
          {/* Edit opens the session sheet, which also has Discard */}
          <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(true)}>
            <Icon name="pencil" size={16} /> Edit session
          </button>
          <button type="button" className="btn live-view-finish" onClick={() => setFinishOpen(true)}>
            <Icon name="flag" size={18} /> Finish session
          </button>
        </div>
      </div>

      <Panel title="Timeline" className="live-view-timeline">
        <SessionTimeline session={session} onChange={onChange} />
      </Panel>

      <FinishSessionSheet
        open={finishOpen}
        session={session}
        elapsedMs={elapsedMs}
        onClose={() => setFinishOpen(false)}
        onFinished={onFinished}
      />

      {editOpen && (
        <EditSessionSheet
          session={session}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            onChange(updated);
            setEditOpen(false);
          }}
          onDeleted={onDiscarded}
        />
      )}
    </div>
  );
}
