// Import (Profile): choose or drop a file. A PokerWiz backup (.json) brings back sessions, hands and goals,
// on this device or another; a Regroup export (.csv) brings sessions over from that app. Either way you see
// what's in the file before anything is saved, and nothing that's already here is added twice. Also undoes
// a Regroup import.
import { useState } from 'react';
import { removeImportedSessions } from '../../api/sessions.js';
import { importBackup } from '../../api/data.js';
import { readRegroupCsv } from '../../utils/csvImport.js';
import { plural } from '../../utils/format.js';
import Panel from '../../components/Panel/Panel.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import RegroupPreview from './RegroupPreview.jsx';
import BackupPreview from './BackupPreview.jsx';
import './ImportData.css';

const MAX_CSV_BYTES = 5_000_000;
const MAX_BACKUP_BYTES = 50_000_000;

// "12 sessions, 40 hands and 2 goals"
function listOf(counts) {
  const parts = [['sessions', 'session'], ['hands', 'hand'], ['goals', 'goal']].filter(([key]) => counts[key] > 0).map(([key, one]) => plural(counts[key], one));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] ?? '';
}

export default function ImportData({ samples, importedCount, onChange }) {
  const [file, setFile] = useState(null); // { name, kind: 'regroup', read } or { name, kind: 'backup', backup, preview }
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState(null); // what the last import or undo did
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Read the chosen file in the browser and work out what it holds; nothing is saved yet. A backup is also
  // checked by the server, which says what it would add (a dry run).
  async function choose(chosen) {
    if (!chosen) return;
    setResult(null);
    setError(null);
    setConfirmUndo(false);
    const named = /\.json$/i.test(chosen.name);
    if (chosen.size > (named ? MAX_BACKUP_BYTES : MAX_CSV_BYTES)) {
      setError(named ? 'That file is too big for a PokerWiz backup (50 MB at most).' : 'That file is too big for a session export (5 MB at most).');
      return;
    }
    const text = await chosen.text();
    if (!named && !text.trimStart().startsWith('{')) {
      setFile({ name: chosen.name, kind: 'regroup', read: readRegroupCsv(text) });
      return;
    }
    let backup = null;
    try {
      backup = JSON.parse(text);
    } catch {
      // not JSON: handled just below
    }
    if (backup?.app !== 'PokerWiz') {
      setError("This file isn't a PokerWiz backup. Choose a backup (.json) downloaded from PokerWiz, or a Regroup export (.csv).");
      return;
    }
    setReading(true);
    try {
      setFile({ name: chosen.name, kind: 'backup', backup, preview: await importBackup(backup, { dryRun: true }) });
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  }

  // After an import: say what happened, and reload the page's data.
  const finished = (outcome) => {
    setResult(outcome);
    setFile(null);
    onChange();
  };

  async function undoImport() {
    setRemoving(true);
    setError(null);
    try {
      const { removed } = await removeImportedSessions('regroup');
      setResult({ kind: 'removed', removed });
      setConfirmUndo(false);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
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

  const added = result?.kind === 'restored' ? { sessions: result.sessions.added, hands: result.hands.added, goals: result.goals.added } : null;

  return (
    <Panel title="Import" className="import-data">
      <p className="import-data-intro">
        Restore a PokerWiz backup (.json), on this device or another: on top of your data, or instead of it. Or bring your history over
        from Regroup: export your sessions as a CSV there. You'll see what's in the file before anything is saved.
      </p>

      {/* File picker and drop zone */}
      {!file && (
        <label className={`import-drop ${dragging ? 'is-dragging' : ''} ${reading ? 'is-reading' : ''}`} {...dropHandlers}>
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="import-drop-input"
            disabled={reading}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <span className="import-drop-icon">
            <Icon name="upload" size={22} />
          </span>
          <span className="import-drop-title">{reading ? 'Reading the backup...' : 'Choose a backup or CSV file'}</span>
          <span className="import-drop-hint">or drop it here</span>
        </label>
      )}

      {/* What's in the chosen file */}
      {file?.kind === 'regroup' && <RegroupPreview name={file.name} read={file.read} samples={samples} onImported={finished} onCancel={() => setFile(null)} />}
      {file?.kind === 'backup' && (
        <BackupPreview name={file.name} backup={file.backup} preview={file.preview} samples={samples} onImported={finished} onCancel={() => setFile(null)} />
      )}

      {/* What the last import or undo did */}
      {result?.kind === 'restored' && (
        <p className="import-message is-success" role="status">
          <Icon name="check" size={16} />
          <span>
            {result.replaced
              ? `Replaced your data with the backup: ${listOf(added) || 'nothing'}. Your previous data was saved as an automatic backup (see "Your data, kept safe")`
              : listOf(added)
                ? `Imported ${listOf(added)}`
                : 'Nothing new to import'}
            {result.removedSamples && ', and removed the sample data'}. Everything is in History, Hands, Goals and Insights.
          </span>
        </p>
      )}
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
              <button type="button" className="btn btn-ghost import-undo-confirm" onClick={undoImport} disabled={removing}>
                {removing ? 'Removing...' : 'Remove'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmUndo(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmUndo(true)}>
              <Icon name="undo" size={16} /> Remove sessions imported from Regroup ({importedCount})
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
