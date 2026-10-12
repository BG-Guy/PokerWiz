// What a chosen PokerWiz backup would add here (the server's dry run): sessions, hands and goals to add, and
// what's already here and stays as it is. Then Import. The same backup twice adds nothing.
import { useState } from 'react';
import { importBackup } from '../../api/data.js';
import { formatLongDate, plural } from '../../utils/format.js';
import Icon from '../../components/Icon/Icon.jsx';

const KINDS = [
  ['sessions', 'session'],
  ['hands', 'hand'],
  ['goals', 'goal'],
];

// preview: importBackup's dry run. onImported(result) once it's saved.
export default function BackupPreview({ name, backup, preview, samples, onImported, onCancel }) {
  const [removeSamples, setRemoveSamples] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hasSamples = samples.sessions + samples.hands > 0;
  const adding = KINDS.filter(([key]) => preview[key].added > 0);
  const alreadyHere = KINDS.filter(([key]) => preview[key].skipped > 0);
  const exported = typeof backup.exportedAt === 'string' ? backup.exportedAt.slice(0, 10) : null;

  async function confirmImport() {
    setBusy(true);
    setError(null);
    try {
      const reply = await importBackup(backup, { removeSamples: hasSamples && removeSamples });
      onImported({ kind: 'restored', ...reply });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="import-preview">
      <p className="import-preview-file">
        <Icon name="note" size={16} /> {name}
      </p>
      <p className="import-preview-headline">
        <strong>PokerWiz backup</strong>
        {exported && ` from ${formatLongDate(exported)}`}
      </p>

      {/* What it adds, and what's already here */}
      {adding.length > 0 ? (
        <ul className="import-preview-facts">
          {adding.map(([key, one]) => (
            <li key={key} className="is-positive">
              + {plural(preview[key].added, one)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="import-message is-success" role="status">
          <Icon name="check" size={16} /> Everything in this backup is already here.
        </p>
      )}
      {alreadyHere.length > 0 && adding.length > 0 && (
        <p className="import-preview-note">
          Already here, left as they are: {alreadyHere.map(([key, one]) => plural(preview[key].skipped, one)).join(', ')}.
        </p>
      )}
      {preview.liveSkipped && (
        <p className="import-message is-warning" role="alert">
          <Icon name="alert" size={16} /> The live session in this backup is left out: one is already running here. Finish it, then import
          the backup again to bring it in.
        </p>
      )}

      {/* The app's sample data would otherwise be mixed into the real record */}
      {hasSamples && adding.length > 0 && (
        <label className="import-samples">
          <input type="checkbox" checked={removeSamples} onChange={(event) => setRemoveSamples(event.target.checked)} />
          <span>
            Also remove the {plural(samples.sessions, 'sample session')}
            {samples.hands > 0 && ` and ${plural(samples.hands, 'sample hand')}`} that came with the app
          </span>
        </label>
      )}

      {error && (
        <p className="import-message is-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <div className="import-actions">
        {adding.length > 0 && (
          <button type="button" className="btn" onClick={confirmImport} disabled={busy}>
            <Icon name="check" size={16} />
            {busy ? 'Importing...' : 'Import the backup'}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          {adding.length > 0 ? 'Cancel' : 'Choose another file'}
        </button>
      </div>
    </div>
  );
}
