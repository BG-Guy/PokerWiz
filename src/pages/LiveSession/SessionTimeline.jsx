// Chronological timeline of a live session: start, then every note, rebuy and saved hand in order.
// With onChange, notes can be edited in place and notes and rebuys removed.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteSessionEvent, updateSessionEvent } from '../../api/sessions.js';
import { formatDuration, formatMoney, formatTime } from '../../utils/format.js';
import Money from '../../components/Money/Money.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './SessionTimeline.css';

const EVENT_ICONS = { start: 'play', note: 'note', rebuy: 'coins', hand: 'cards' };

// Body of one entry, depending on its type.
function EntryContent({ entry, initialBuyIn, bb }) {
  if (entry.type === 'start') {
    return (
      <p className="session-timeline-text">
        Sat down with <strong className="num">{formatMoney(initialBuyIn, { sign: false, bb })}</strong>
      </p>
    );
  }
  if (entry.type === 'note') return <p className="session-timeline-text is-note">{entry.text}</p>;
  if (entry.type === 'rebuy') {
    return (
      <p className="session-timeline-text">
        Rebuy <strong className="num">{formatMoney(entry.amount, { sign: false, bb })}</strong>
      </p>
    );
  }
  // Saved hand: links to the review page
  return (
    <Link to={`/hands/${entry.handId}`} className="session-timeline-hand">
      <span>{entry.text}</span>
      {entry.amount != null && <Money amount={entry.amount} bb={bb} />}
      <Icon name="chevronRight" size={16} />
    </Link>
  );
}

// Inline editor for a note's text.
function NoteEditor({ text, busy, onSave, onCancel }) {
  const [value, setValue] = useState(text);
  return (
    <form
      className="session-timeline-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <textarea autoFocus rows={3} value={value} aria-label="Note" onChange={(event) => setValue(event.target.value)} />
      <div className="session-timeline-editor-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={busy || !value.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

export default function SessionTimeline({ session, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Run a timeline edit and hand the updated session back to the page.
  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await work());
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const removeEntry = (entry) => {
    const what = entry.type === 'rebuy' ? 'this rebuy (it comes off your buy-in)' : 'this note';
    if (window.confirm(`Remove ${what}?`)) run(() => deleteSessionEvent(session.id, entry.id));
  };

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
              {editingId === entry.id ? (
                <NoteEditor
                  text={entry.text}
                  busy={busy}
                  onSave={(text) => run(() => updateSessionEvent(session.id, entry.id, { text }))}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <EntryContent entry={entry} initialBuyIn={session.buyIn - rebuyTotal} bb={session.bigBlind} />
              )}
            </div>

            {/* Edit / remove buttons for notes and rebuys (saved hands are edited from Hand Review) */}
            {onChange && (entry.type === 'note' || entry.type === 'rebuy') && editingId !== entry.id && (
              <span className="session-timeline-tools">
                {entry.type === 'note' && (
                  <button type="button" className="session-timeline-tool" aria-label="Edit note" onClick={() => setEditingId(entry.id)}>
                    <Icon name="pencil" size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className="session-timeline-tool"
                  aria-label={entry.type === 'note' ? 'Remove note' : 'Remove rebuy'}
                  disabled={busy}
                  onClick={() => removeEntry(entry)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p className="session-timeline-error" role="alert">
          {error}
        </p>
      )}

      {session.events.length === 0 && <p className="session-timeline-empty">Hands and notes you add show up here, in order.</p>}
    </div>
  );
}
