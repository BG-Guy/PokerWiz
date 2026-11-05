// Flagged decisions (Profile): the graded decisions you flagged in hand reviews and Practice, kept on this
// device. Export them as one file (on iPhone, AirDrop it from the share sheet) to have them reviewed as leaks.
import { useState } from 'react';
import Panel from '../../components/Panel/Panel.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import { useFlags } from '../../hooks/useFlags.js';
import { exportFlags, removeFlag, clearFlags } from '../../utils/flags.js';
import './FlaggedDecisions.css';

const SOURCE = { review: 'Hand review', practice: 'Practice' };
const dateOf = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function FlaggedDecisions() {
  const flags = useFlags();
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState(null);

  const save = () => {
    setError(null);
    exportFlags().catch((err) => setError(err.message));
  };

  return (
    <Panel title="Flagged decisions" className="flagged-decisions">
      <p className="flagged-intro">
        Tap <strong>Flag</strong> on any graded decision (hand reviews and Practice) that looks wrong. Flags stay on this device; export them as
        one file to have them reviewed.
      </p>

      {flags.length === 0 ? (
        <p className="flagged-empty">No flagged decisions yet.</p>
      ) : (
        <ul className="flagged-list">
          {flags.map((flag) => {
            const d = flag.decision;
            const hero = flag.record?.players?.find((p) => p.role === 'hero');
            return (
              <li key={flag.id} className="flagged-item">
                {/* Your cards, the spot and the engine's verdict */}
                <span className="flagged-cards">
                  {(hero?.cards ?? []).map((code) => (
                    <PlayingCard key={code} code={code} size="xs" />
                  ))}
                </span>
                <span className="flagged-text">
                  <strong>
                    {hero?.position} · {d.street} · {d.grade ?? 'Not graded'}
                  </strong>
                  <span>
                    You: {d.you ?? '–'} · GTO: {d.gto ?? '–'}
                  </span>
                  {flag.note && <em>“{flag.note}”</em>}
                  <span className="flagged-meta">
                    {SOURCE[flag.source] ?? flag.source} · {dateOf(flag.flaggedAt)}
                  </span>
                </span>
                <button type="button" className="flagged-remove" onClick={() => removeFlag(flag.id)} aria-label="Remove this flag">
                  <Icon name="close" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flagged-actions">
        <button type="button" className="btn" onClick={save} disabled={flags.length === 0}>
          <Icon name="share" size={16} /> Export {flags.length > 0 ? `${flags.length} ` : ''}flagged
        </button>
        {flags.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setClearing(true)}>
            <Icon name="trash" size={16} /> Clear all
          </button>
        )}
      </div>
      {error && (
        <p className="flagged-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <ConfirmDialog
        open={clearing}
        title="Clear all flags?"
        message="The flagged decisions are removed from this device. Export them first if you still want them reviewed."
        confirmLabel="Clear all"
        onConfirm={() => {
          clearFlags();
          setClearing(false);
        }}
        onClose={() => setClearing(false)}
      />
    </Panel>
  );
}
