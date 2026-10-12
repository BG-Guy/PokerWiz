// What's in a chosen Regroup CSV export: how many sessions, the dates, the result, anything filled in or
// unreadable, then Import. Sessions already in PokerWiz are skipped, so the same file twice adds nothing.
import { useState } from 'react';
import { importSessions } from '../../api/sessions.js';
import { importPreview } from '../../utils/csvImport.js';
import { formatLongDate, formatMoney, plural } from '../../utils/format.js';
import Icon from '../../components/Icon/Icon.jsx';

const SOURCE = 'regroup';

// read: readRegroupCsv's result. onImported(result) once it's saved.
export default function RegroupPreview({ name, read, samples, onImported, onCancel }) {
  const [removeSamples, setRemoveSamples] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hasSamples = samples.sessions + samples.hands > 0;
  const preview = read.error ? null : importPreview(read.sessions);

  async function confirmImport() {
    setBusy(true);
    setError(null);
    try {
      const reply = await importSessions({ source: SOURCE, sessions: read.sessions, removeSamples: hasSamples && removeSamples });
      onImported({ kind: 'imported', ...reply });
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

      {read.error ? (
        <p className="import-message is-error" role="alert">
          <Icon name="alert" size={16} /> {read.error}
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
          {read.warnings.length > 0 && (
            <details className="import-details">
              <summary>{plural(read.warnings.length, 'session')} filled in</summary>
              <ul>
                {read.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Rows that can't be imported */}
          {read.skipped.length > 0 && (
            <div className="import-message is-warning" role="alert">
              <p>
                <Icon name="alert" size={16} /> {plural(read.skipped.length, 'row')} can't be read and will be skipped:
              </p>
              <ul>
                {read.skipped.map((reason) => (
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

      {error && (
        <p className="import-message is-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <div className="import-actions">
        {preview?.count > 0 && (
          <button type="button" className="btn" onClick={confirmImport} disabled={busy}>
            <Icon name="check" size={16} />
            {busy ? 'Importing...' : `Import ${plural(preview.count, 'session')}`}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          {read.error ? 'Choose another file' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
