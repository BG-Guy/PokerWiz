// Your data, kept safe (Profile): the automatic backups the server saves (when it starts, which every update
// does, once a day, and before your data is replaced), each to download or put back, and the copy this device
// keeps (components/DataGuard). Putting a backup back replaces your data, after saving what's here first.
import { useEffect, useState } from 'react';
import { getSnapshots, restoreSnapshot, saveSnapshot, snapshotUrl } from '../../api/data.js';
import { readDeviceCopy } from '../../utils/deviceBackup.js';
import { saveBlob, saveFile } from '../../utils/download.js';
import { formatLongDate, formatTime, plural } from '../../utils/format.js';
import Panel from '../../components/Panel/Panel.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './DataSafety.css';

const REASONS = {
  startup: 'When the app started',
  daily: 'Daily',
  'before-replace': 'Before an import replaced your data',
  'before-restore': 'Before a backup was put back',
  manual: 'Saved by you',
};
const SHOWN = 6;

const when = (iso) => `${formatLongDate(iso.slice(0, 10))}, ${formatTime(iso)}`;
const sizeOf = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

// Save the device copy as a file (the same format as a downloaded backup).
const downloadCopy = (copy) =>
  saveBlob(new Blob([JSON.stringify(copy.backup, null, 1)], { type: 'application/json' }), `pokerwiz-device-copy-${copy.savedAt.slice(0, 10)}.json`);

export default function DataSafety() {
  const [snapshots, setSnapshots] = useState(null);
  const [copy, setCopy] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [restoring, setRestoring] = useState(null); // the snapshot waiting for "Put it back"
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    getSnapshots()
      .then(setSnapshots)
      .catch((err) => setError(err.message));
    readDeviceCopy().then(setCopy);
  };
  useEffect(load, []);

  async function saveNow() {
    setNote(null);
    setError(null);
    try {
      const saved = await saveSnapshot();
      setNote(saved ? 'Saved.' : 'Nothing changed since the last automatic backup.');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Put a backup back, then reload every page's data.
  async function restore() {
    await restoreSnapshot(restoring.name);
    window.location.reload();
  }

  const list = snapshots ?? [];
  const shown = showAll ? list : list.slice(0, SHOWN);
  return (
    <Panel title="Your data, kept safe" className="data-safety">
      <p className="data-safety-intro">
        The app saves a backup of everything by itself: every time it starts (each update restarts it), once a day, and before your data is
        replaced. They stay on the server; to have a copy off it too, download a backup above now and then and keep it in your email or a
        cloud drive.
      </p>

      {/* Automatic backups on the server */}
      <div className="data-safety-head">
        <strong>Automatic backups</strong>
        <button type="button" className="btn btn-ghost" onClick={saveNow}>
          <Icon name="check" size={16} /> Save one now
        </button>
      </div>
      {note && <p className="data-safety-note">{note}</p>}
      {error && (
        <p className="data-safety-note is-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      {snapshots && list.length === 0 && <p className="data-safety-note">None yet: the first one is saved once you've logged something of your own.</p>}
      {list.length > 0 && (
        <ul className="data-safety-list">
          {shown.map((s) => (
            <li key={s.name}>
              <span className="data-safety-when">
                <strong>{when(s.createdAt)}</strong>
                <span>
                  {REASONS[s.reason] ?? s.reason} · {sizeOf(s.size)}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => saveFile(snapshotUrl(s.name), s.name).catch((err) => setError(err.message))}
                aria-label={`Download the backup from ${when(s.createdAt)}`}
              >
                <Icon name="download" size={16} />
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRestoring(s)}>
                Put back
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > SHOWN && (
        <button type="button" className="btn btn-ghost data-safety-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}

      {/* The copy in this browser */}
      <div className="data-safety-device">
        <Icon name="hero" size={18} />
        <p>
          {copy ? (
            <>
              <strong>This device has a copy too</strong> (saved {when(copy.savedAt)}: {plural(copy.counts.sessions, 'session')},{' '}
              {plural(copy.counts.hands, 'hand')}). If the server ever comes back without your data, the app offers to put it back.
            </>
          ) : (
            <>This device keeps a copy of your data once you've logged something, refreshed while you use the app.</>
          )}
        </p>
        {copy && (
          <button type="button" className="btn btn-ghost" onClick={() => downloadCopy(copy)}>
            <Icon name="download" size={16} /> Download it
          </button>
        )}
      </div>

      <ConfirmDialog
        open={restoring !== null}
        title="Put this backup back?"
        message={
          restoring &&
          `Your data becomes what it was on ${when(restoring.createdAt)}. What's here now is saved as an automatic backup first, so you can switch back.`
        }
        confirmLabel="Put it back"
        onConfirm={restore}
        onClose={() => setRestoring(null)}
      />
    </Panel>
  );
}
