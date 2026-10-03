// Importing sessions from another app: choose (or drop) a Regroup CSV export, check the preview (how many
// sessions, the dates, the result, anything filled in or unreadable), then import. Sessions already in PokerWiz
// are skipped, so importing the same file twice adds nothing. Also offers to remove the sample data that came
// with the app, and to undo an import.
import { useState } from 'react';
import { importSessions, removeImportedSessions } from '../../api/sessions.js';
import { readRegroupCsv, importPreview } from '../../utils/csvImport.js';
import { formatLongDate, formatMoney } from '../../utils/format.js';
import Panel from '../../components/Panel/Panel.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './ImportSessions.css';

const SOURCE = 'regroup';
const MAX_FILE_BYTES = 5_000_000;
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export default function ImportSessions({ samples, importedCount, onChange }) {
  const [file, setFile] = useState(null); // { name, read } once a file is chosen (read = readRegroupCsv result)
  const [removeSamples, setRemoveSamples] = useState(true);
  const [busy, setBusy] = useState(null); // 'importing' | 'removing'
  const [result, setResult] = useState(null); // what the last import or undo did
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const hasSamples = samples.sessions + samples.hands > 0;
  const preview = file && !file.read.error ? importPreview(file.read.sessions) : null;

  // Read the chosen file in the browser and show what it holds; nothing is saved yet.
  async function choose(chosen) {
    if (!chosen) return;
    setResult(null);
    setError(null);
    setConfirmUndo(false);
    if (chosen.size > MAX_FILE_BYTES) {
      setError('That file is too big for a session export (5 MB at most).');
      return;
    }
    setFile({ name: chosen.name, read: readRegroupCsv(await chosen.text()) });
  }

  async function confirmImport() {
    setBusy('importing');
    setError(null);
    try {
      const reply = await importSessions({ source: SOURCE, sessions: file.read.sessions, removeSamples: hasSamples && removeSamples });
      setResult({ kind: 'imported', ...reply });
      setFile(null);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function undoImport() {
    setBusy('removing');
    setError(null);
    try {
      const { removed } = await removeImportedSessions(SOURCE);
      setResult({ kind: 'removed', removed });
      setConfirmUndo(false);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // Dropping a file onto the picker works like choosing it.
  const dropHandlers = {
    onDragOver: (event) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event) => {
      event.preventDefault();
      setDragging(false);
      choose(event.dataTransfer.files?.[0]);
    },
  };

  return (
    <Panel title="Import sessions" className="import-sessions">
      <p className="import-sessions-intro">
        Bring your history over from Regroup: export your sessions as a CSV there, then choose the file here. You'll see
        what's in it before anything is saved.
      </p>

      {/* File picker and drop zone */}
      {!file && (
        <label className={`import-drop ${dragging ? 'is-dragging' : ''}`} {...dropHandlers}>
          <input
            type="file"
            accept=".csv,text/csv"
            className="import-drop-input"
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <span className="import-drop-icon">
            <Icon name="note" size={22} />
          </span>
          <span className="import-drop-title">Choose a CSV file</span>
          <span className="import-drop-hint">or drop it here</span>
        </label>
      )}

      {/* Preview of the chosen file */}
      {file && (
        <div className="import-preview">
          <p className="import-preview-file">
            <Icon name="note" size={16} /> {file.name}
          </p>

          {file.read.error ? (
            <p className="import-message is-error" role="alert">
              <Icon name="alert" size={16} /> {file.read.error}
            </p>
          ) : (
            <>
              <p className="import-preview-headline">
                <strong>{plural(preview.count, 'session')}</strong>
                {preview.first && ` from ${formatLongDate(preview.first)} to ${formatLongDate(preview.last)}`}
              </p>
              <ul className="import-preview-facts">
                <li>{plural(preview.cash, 'cash game')}</li>
                {preview.tournaments > 0 && <li>{plural(preview.tournaments, 'tournament')}</li>}
                <li>{preview.hours.toFixed(1)} hours</li>
                <li className={preview.net >= 0 ? 'is-positive' : 'is-negative'}>{formatMoney(preview.net)} net</li>
                <li>{plural(preview.withNotes, 'with notes', 'with notes')}</li>
              </ul>

              {/* Values that were filled in, e.g. a missing cash-out */}
              {file.read.warnings.length > 0 && (
                <details className="import-details">
                  <summary>{plural(file.read.warnings.length, 'session')} filled in</summary>
                  <ul>
                    {file.read.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Rows that can't be imported */}
              {file.read.skipped.length > 0 && (
                <div className="import-message is-warning" role="alert">
                  <p>
                    <Icon name="alert" size={16} /> {plural(file.read.skipped.length, 'row')} can't be read and will be skipped:
                  </p>
                  <ul>
                    {file.read.skipped.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* The app's sample data would otherwise be mixed into the real record */}
              {hasSamples && preview.count > 0 && (
                <label className="import-samples">
                  <input type="checkbox" checked={removeSamples} onChange={(event) => setRemoveSamples(event.target.checked)} />
                  <span>
                    Also remove the {plural(samples.sessions, 'sample session')}
                    {samples.hands > 0 && ` and ${plural(samples.hands, 'sample hand')}`} that came with the app
                  </span>
                </label>
              )}
            </>
          )}

          <div className="import-actions">
            {preview?.count > 0 && (
              <button type="button" className="btn" onClick={confirmImport} disabled={busy !== null}>
                <Icon name="check" size={16} />
                {busy === 'importing' ? 'Importing...' : `Import ${plural(preview.count, 'session')}`}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setFile(null)} disabled={busy !== null}>
              {file.read.error ? 'Choose another file' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* What the last import or undo did */}
      {result?.kind === 'imported' && (
        <p className="import-message is-success" role="status">
          <Icon name="check" size={16} />
          {result.imported === 0 ? (
            <span>All {plural(result.skipped, 'session')} in this file were already in PokerWiz, so nothing new was added.</span>
          ) : (
            <span>
              Imported {plural(result.imported, 'session')}
              {result.skipped > 0 && ` (${plural(result.skipped, 'other was', 'others were')} already in PokerWiz)`}
              {result.removedSamples &&
                ` and removed the sample data (${plural(result.removedSamples.sessions, 'session')}, ${plural(result.removedSamples.hands, 'hand')})`}
              . They're in your session log below, and in History, Insights and your goals.
            </span>
          )}
        </p>
      )}
      {result?.kind === 'removed' && (
        <p className="import-message is-success" role="status">
          <Icon name="check" size={16} /> Removed {plural(result.removed, 'imported session')}.
        </p>
      )}
      {error && (
        <p className="import-message is-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      {/* Undo: remove everything imported from Regroup (asks first) */}
      {importedCount > 0 && !file && (
        <div className="import-undo">
          {confirmUndo ? (
            <>
              <span>Remove all {plural(importedCount, 'session')} imported from Regroup?</span>
              <button type="button" className="btn btn-ghost import-undo-confirm" onClick={undoImport} disabled={busy !== null}>
                {busy === 'removing' ? 'Removing...' : 'Remove'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmUndo(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmUndo(true)}>
              <Icon name="undo" size={16} /> Remove imported sessions ({importedCount})
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
