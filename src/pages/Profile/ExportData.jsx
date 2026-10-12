// Export (Profile): download a backup of everything (to keep safe, or to import on another device) and
// spreadsheets of your sessions and hands. Remembers on this device when you last downloaded a backup.
import { useState } from 'react';
import { DOWNLOADS } from '../../api/data.js';
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

  // The link downloads the file; note the day on this device.
  const remember = () => {
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
        <a className="btn export-backup-btn" href={DOWNLOADS.backup} download onClick={remember}>
          <Icon name="download" size={16} /> Download backup
        </a>
      </div>

      {/* Spreadsheets, to look at the numbers elsewhere */}
      <div className="export-sheets">
        <div className="export-sheets-text">
          <strong>Spreadsheets</strong>
          <p>For Excel, Numbers or Google Sheets. Amounts in dollars.</p>
        </div>
        <div className="export-sheets-links">
          <a className="btn btn-ghost" href={DOWNLOADS.sessions} download>
            <Icon name="download" size={16} /> Sessions (.csv)
          </a>
          <a className="btn btn-ghost" href={DOWNLOADS.hands} download>
            <Icon name="download" size={16} /> Hands (.csv)
          </a>
        </div>
      </div>
    </Panel>
  );
}
