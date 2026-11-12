// The running session: live clock, quick actions (add hand, note, rebuy), the timeline, and Finish.
// Edit (on the header card, or on a timeline entry) changes the setup, a note or a rebuy; Discard throws it away.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addSessionEvent, discardSession } from '../../api/sessions.js';
import { formatClock, formatMoney, formatTime } from '../../utils/format.js';
import { stakeDetails } from '../../utils/stakes.js';
import { LIVE_HANDS_AN_HOUR, liveSessionDetail } from '../../utils/sessionDetails.js';
import { useDetailView } from '../../hooks/useDetailView.js';
import DetailSheet from '../../components/DetailSheet/DetailSheet.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import { useClosingValue } from '../../hooks/useClosingValue.js';
import Panel from '../../components/Panel/Panel.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import SessionTimeline from './SessionTimeline.jsx';
import FinishSessionSheet from './FinishSessionSheet.jsx';
import EditLiveSessionSheet from './EditLiveSessionSheet.jsx';
import EditEntrySheet from './EditEntrySheet.jsx';
import './LiveSessionView.css';

export default function LiveSessionView({ session, onChange, onFinished, onDiscarded }) {
  const [now, setNow] = useState(Date.now());
  const [composer, setComposer] = useState(null); // which inline form is open: 'note' | 'rebuy' | null
  const [noteText, setNoteText] = useState('');
  const [rebuyAmount, setRebuyAmount] = useState(String(session.bigBlind * 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [editing, setEditing] = useState(null); // 'setup', a timeline entry, or null
  const [sheet, sheetOpen] = useClosingValue(editing); // stays up while it slides closed
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const detail = useDetailView(); // the number on the card whose story is open

  // Tick the session clock every second.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedMs = now - new Date(session.startedAt).getTime();
  const handCount = session.events.filter((e) => e.type === 'hand').length;
  // Hands dealt so far, at a live table's ~30 hands an hour.
  const handsDealt = Math.floor((elapsedMs / 3600000) * LIVE_HANDS_AN_HOUR);
  const noteCount = session.events.filter((e) => e.type === 'note').length;
  const numbers = [
    { id: 'buyin', label: 'Buy-in', value: formatMoney(session.buyIn, { sign: false, bb: session.bigBlind }) },
    { id: 'dealt', label: 'Hands dealt', value: `~${handsDealt}` },
    { id: 'saved', label: 'Saved', value: handCount },
    { id: 'notes', label: 'Notes', value: noteCount },
  ];
  const shownDetail = detail.shownKey ? liveSessionDetail(detail.shownKey, session, elapsedMs) : null;

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

  // Throw the session away (asked first, in the confirm dialog).
  const handleDiscard = async () => {
    await discardSession(session.id);
    onDiscarded();
  };

  return (
    <div className="live-view">
      <div className="live-view-main">
        {/* Header card on felt: status, stakes and the running clock */}
        <section className="live-view-hero">
          <button type="button" className="live-view-edit" onClick={() => setEditing('setup')} aria-label="Edit the session setup">
            <Icon name="pencil" size={16} /> Edit
          </button>
          <span className="live-view-status">
            <span className="live-view-dot" aria-hidden="true" /> Live
          </span>
          <h1 className="live-view-title">
            {session.game} {session.stakes}
          </h1>
          <p className="live-view-subtitle">
            {session.venue} · started {formatTime(session.startedAt)}
          </p>
          {/* Custom stakes: the table's seats, ante, straddle and name */}
          {stakeDetails(session) && <p className="live-view-table">{stakeDetails(session)}</p>}
          <div className="live-view-clock num" role="timer" aria-label="Time played">
            {formatClock(elapsedMs)}
          </div>
          {/* The session so far in four numbers: tap one for its story */}
          <div className="live-view-numbers">
            {numbers.map((item) => (
              <button key={item.id} type="button" className="live-view-number" onClick={() => detail.open(item.id)} ref={detail.cardRef(item.id)} aria-haspopup="dialog">
                <span className="live-view-number-label">{item.label}</span>
                <span className="live-view-number-value num">{item.value}</span>
              </button>
            ))}
          </div>
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
          <button type="button" className="btn btn-ghost live-view-discard" onClick={() => setConfirmDiscard(true)}>
            <Icon name="trash" size={16} /> Discard
          </button>
          <button type="button" className="btn live-view-finish" onClick={() => setFinishOpen(true)}>
            <Icon name="flag" size={18} /> Finish session
          </button>
        </div>
      </div>

      <Panel title="Timeline" className="live-view-timeline">
        <SessionTimeline session={session} onEdit={(entry) => setEditing(entry.type === 'start' ? 'setup' : entry)} />
      </Panel>

      {/* Edit sheets: the setup, or one note or rebuy */}
      {sheet === 'setup' && <EditLiveSessionSheet session={session} open={sheetOpen} onClose={() => setEditing(null)} onSaved={onChange} />}
      {sheet && sheet !== 'setup' && (
        <EditEntrySheet key={sheet.id} session={session} entry={sheet} open={sheetOpen} onClose={() => setEditing(null)} onSaved={onChange} />
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this session?"
        message={`Nothing from it will be saved to your history.${
          handCount ? ` The ${handCount} ${handCount === 1 ? 'hand' : 'hands'} you saved stay in your hands list.` : ''
        }`}
        confirmLabel="Discard session"
        onConfirm={handleDiscard}
        onClose={() => setConfirmDiscard(false)}
      />

      {/* The story behind a number on the card */}
      <DetailSheet open={detail.openKey !== null} onClose={detail.close} title={shownDetail?.title ?? ''} originRef={detail.originRef}>
        {shownDetail && <StatDetail detail={shownDetail} />}
      </DetailSheet>

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
