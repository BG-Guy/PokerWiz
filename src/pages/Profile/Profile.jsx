// Profile (/profile): your whole poker record in one place. Lifetime totals for cash games and tournaments,
// results by location, your data in and out (a backup to download and import back, spreadsheets, and
// sessions from another app), and every session with all of its details and notes.
import { getSessions, getSampleData } from '../../api/sessions.js';
import { useApi } from '../../hooks/useApi.js';
import { formatLongDate } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import ProfileSummary from './ProfileSummary.jsx';
import ExportData from './ExportData.jsx';
import ImportData from './ImportData.jsx';
import SessionLog from './SessionLog.jsx';
import './Profile.css';

const loadProfile = () => Promise.all([getSessions(), getSampleData()]);

export default function Profile() {
  const { data, error, reload } = useApi(loadProfile);
  if (!data) return <LoadState error={error} onRetry={reload} />;

  const [sessions, samples] = data;
  const firstDate = sessions.map((s) => s.date).sort()[0];
  const subtitle = sessions.length
    ? `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} logged since ${formatLongDate(firstDate)}.`
    : 'No sessions yet. Import your history below, or start a session.';

  return (
    <div className="profile">
      <PageHeader title="Profile" subtitle={subtitle} />

      {/* Totals next to export and import (stacked on phones) */}
      <div className="profile-top">
        {sessions.length > 0 && <ProfileSummary sessions={sessions} />}
        <div className="profile-data">
          <ExportData />
          <ImportData samples={samples} importedCount={sessions.filter((s) => s.source === 'regroup').length} onChange={reload} />
        </div>
      </div>

      {sessions.length > 0 && <SessionLog sessions={sessions} />}
    </div>
  );
}
