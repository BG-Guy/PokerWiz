// What a chosen PokerWiz backup would do here (the server's dry run), in either of two ways: add it on top of
// your data (what's already here stays; the same backup twice adds nothing), or replace your data with it
// (everything here is deleted and the backup comes in; an automatic backup of what's here is saved first, so it
// can be put back from "Your data, kept safe"). Then Import.
import { useState } from 'react';
import { importBackup } from '../../api/data.js';
import { formatLongDate, plural } from '../../utils/format.js';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import Icon from '../../components/Icon/Icon.jsx';

const KINDS = [
  ['sessions', 'session'],
  ['hands', 'hand'],
  ['goals', 'goal'],
];
const MODES = [
  { value: 'add', label: 'Add to my data' },
  { value: 'replace', label: 'Replace my data' },
];
const listOf = (counts) =>
  KINDS.filter(([key]) => counts[key] > 0)
    .map(([key, one]) => plural(counts[key], one))
    .join(', ');

// preview: importBackup's dry run (add mode). onImported(result) once it's saved.
export default function BackupPreview({ name, backup, preview, samples, onImported, onCancel }) {
  const [mode, setMode] = useState('add');
  const [replacePreview, setReplacePreview] = useState(null); // the dry run of a replace, once asked for
  const [removeSamples, setRemoveSamples] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hasSamples = samples.sessions + samples.hands > 0;
  const shown = mode === 'replace' ? replacePreview : preview;
  const adding = shown ? KINDS.filter(([key]) => shown[key].added > 0) : [];
  const alreadyHere = KINDS.filter(([key]) => preview[key].skipped > 0);
  const exported = typeof backup.exportedAt === 'string' ? backup.exportedAt.slice(0, 10) : null;

  // Switching to replace works out what it would delete and add (another dry run).
  async function chooseMode(next) {
    setMode(next);
    setError(null);
    if (next === 'replace' && !replacePreview) {
      try {
        setReplacePreview(await importBackup(backup, { dryRun: true, mode: 'replace' }));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function confirmImport() {
    setBusy(true);
    setError(null);
    try {
      const reply = await importBackup(backup, { mode, removeSamples: mode === 'add' && hasSamples && removeSamples });
      onImported({ kind: 'restored', ...reply });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      throw err;
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

      {/* On top of your data, or instead of it */}
      <FilterChips label="How to import it" options={MODES} value={mode} onChange={chooseMode} />

      {mode === 'add' &&
        (adding.length > 0 ? (
          <>
            <ul className="import-preview-facts">
              {adding.map(([key, one]) => (
                <li key={key} className="is-positive">
                  + {plural(preview[key].added, one)}
                </li>
              ))}
            </ul>
            {alreadyHere.length > 0 && (
              <p className="import-preview-note">
                Already here, left as they are: {alreadyHere.map(([key, one]) => plural(preview[key].skipped, one)).join(', ')}.
              </p>
            )}
          </>
        ) : (
          <p className="import-message is-success" role="status">
            <Icon name="check" size={16} /> Everything in this backup is already here.
          </p>
        ))}

      {mode === 'replace' && replacePreview && (
        <>
          <ul className="import-preview-facts">
            {listOf(replacePreview.replaced) && <li className="is-negative">Deleted: everything here now ({listOf(replacePreview.replaced)})</li>}
            <li className="is-positive">In its place: {listOf({ sessions: replacePreview.sessions.added, hands: replacePreview.hands.added, goals: replacePreview.goals.added }) || 'nothing'}</li>
          </ul>
          <p className="import-preview-note">
            Your data becomes exactly what's in this backup. An automatic backup of what's here now is saved first, so you can put it back
            from "Your data, kept safe".
          </p>
        </>
      )}

      {preview.liveSkipped && mode === 'add' && (
        <p className="import-message is-warning" role="alert">
          <Icon name="alert" size={16} /> The live session in this backup is left out: one is already running here. Finish it, then import
          the backup again to bring it in.
        </p>
      )}

      {/* The app's sample data would otherwise be mixed into the real record */}
      {mode === 'add' && hasSamples && adding.length > 0 && (
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
        {mode === 'add' && adding.length > 0 && (
          <button type="button" className="btn" onClick={() => confirmImport().catch(() => {})} disabled={busy}>
            <Icon name="check" size={16} />
            {busy ? 'Importing...' : 'Add to my data'}
          </button>
        )}
        {mode === 'replace' && replacePreview && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)} disabled={busy}>
            <Icon name="upload" size={16} /> Replace my data
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          {mode === 'add' && adding.length === 0 ? 'Choose another file' : 'Cancel'}
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Replace your data with this backup?"
        message={`Everything here now is deleted and this backup takes its place${exported ? ` (from ${formatLongDate(exported)})` : ''}. An automatic backup of what's here is saved first.`}
        confirmLabel="Replace my data"
        onConfirm={confirmImport}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
