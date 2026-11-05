// Profile (/profile): you and the app, laid out like a phone's settings screen. Who you are at the table (with
// your record in three numbers), the app's settings, your data in and out (backup, automatic backups, import),
// and what version of PokerWiz this is. Sessions themselves live in History.
import { useState } from 'react';
import { getSessions, getSampleData } from '../../api/sessions.js';
import { getSettings, updateSettings } from '../../api/settings.js';
import { useApi } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import ProfileCard from './ProfileCard.jsx';
import UserInfo from './UserInfo.jsx';
import EditProfileSheet from './EditProfileSheet.jsx';
import AppSettings from './AppSettings.jsx';
import AppInfo from './AppInfo.jsx';
import SettingsSection from './SettingsSection.jsx';
import ExportData from './ExportData.jsx';
import DataSafety from './DataSafety.jsx';
import ImportData from './ImportData.jsx';
import FlaggedDecisions from './FlaggedDecisions.jsx';
import './Profile.css';

const loadProfile = () => Promise.all([getSessions(), getSampleData(), getSettings()]);

export default function Profile() {
  const { data, error, reload, setData } = useApi(loadProfile);
  const [editing, setEditing] = useState({ open: false, key: 0 });
  const [saveError, setSaveError] = useState(null);
  if (!data) return <LoadState error={error} onRetry={reload} />;

  const [sessions, samples, settings] = data;
  const setSettings = (next) => setData(([s, samples]) => [s, samples, next]);
  const openEditor = () => setEditing((current) => ({ open: true, key: current.key + 1 }));

  // The buy-in depth changes right away, then is saved (put back if saving fails).
  const saveDepth = async (buyInDepth) => {
    const before = settings;
    setSettings({ ...settings, buyInDepth });
    setSaveError(null);
    try {
      setSettings(await updateSettings({ buyInDepth }));
    } catch (err) {
      setSettings(before);
      setSaveError(err.message);
    }
  };

  return (
    <div className="profile">
      <PageHeader title="Profile" subtitle="You, the app's settings and your data." />

      <div className="profile-columns">
        {/* You and the app */}
        <div className="profile-column">
          <ProfileCard settings={settings} sessions={sessions} onEdit={openEditor} />
          <UserInfo settings={settings} onEdit={openEditor} order={1} />
          <AppSettings buyInDepth={settings.buyInDepth} onDepth={saveDepth} order={2} />
          {saveError && (
            <p className="profile-error" role="alert">
              {saveError}
            </p>
          )}
          <AppInfo order={3} />
        </div>

        {/* Your data in and out */}
        <div className="profile-column">
          <SettingsSection title="Your data" order={4} plain className="profile-data">
            <ExportData />
            <DataSafety />
            <ImportData samples={samples} importedCount={sessions.filter((s) => s.source === 'regroup').length} onChange={reload} />
            <FlaggedDecisions />
          </SettingsSection>
        </div>
      </div>

      <EditProfileSheet key={editing.key} open={editing.open} onClose={() => setEditing((current) => ({ ...current, open: false }))} settings={settings} onSaved={setSettings} />
    </div>
  );
}
