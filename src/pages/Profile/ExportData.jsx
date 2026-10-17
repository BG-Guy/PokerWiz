// Export (Profile): download a backup of everything (to keep safe, or to import on another device) and
// spreadsheets of your sessions and hands. Remembers on this device when you last downloaded a backup.
import { useState } from 'react';
import { DOWNLOADS } from '../../api/data.js';
import { saveFile } from '../../utils/download.js';
import { formatLongDate, todayIso } from '../../utils/format.js';
import Panel from '../../components/Panel/Panel.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './ExportData.css';

const LAST_BACKUP_KEY = 'pokerwiz-last-backup';

function readLastBackup() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null; // storage blocked: just not remembered
  }
}

export default function ExportData() {
  const [lastBackup, setLastBackup] = useState(readLastBackup);

  const [error, setError] = useState(null);
  // Save one of the files (in the Home Screen app, through the share sheet: no browser view).
  const save = (url) => {
    setError(null);
    return saveFile(url).catch((err) => setError(err.message));
  };

  // Download the backup, and note the day on this device.
  const remember = async () => {
    await save(DOWNLOADS.backup);
    const today = todayIso();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, today);
    } catch {
      // storage blocked: just not remembered
    }
    setLastBackup(today);
  };

  return (
    <Panel title="Export" className="export-data">
      {/* The backup: everything, in a file PokerWiz can import again */}
      <div className="export-backup">
        <span className="export-icon">
          <Icon name="download" size={22} />
        </span>
        <div className="export-backup-text">
          <strong>Back up everything</strong>
          <p>
            Your sessions (with their timelines), hands, notes, ratings and goals in one file. Import it below to restore them, on this
            device or another.
          </p>
          <span className="export-last">{lastBackup ? `Last backup from this device: ${formatLongDate(lastBackup)}` : 'No backup downloaded on this device yet'}</span>
        </div>
        <button type="button" className="btn export-backup-btn" onClick={remember}>
          <Icon name="download" size={16} /> Download backup
        </button>
      </div>

      {/* Spreadsheets, to look at the numbers elsewhere */}
      <div className="export-sheets">
        <div className="export-sheets-text">
          <strong>Spreadsheets</strong>
          <p>For Excel, Numbers or Google Sheets. Amounts in dollars.</p>
        </div>
        <div className="export-sheets-links">
          <button type="button" className="btn btn-ghost" onClick={() => save(DOWNLOADS.sessions)}>
            <Icon name="download" size={16} /> Sessions (.csv)
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => save(DOWNLOADS.hands)}>
            <Icon name="download" size={16} /> Hands (.csv)
          </button>
        </div>
      </div>
      {error && (
        <p className="export-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
    </Panel>
  );
}
