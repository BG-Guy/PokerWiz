// "About PokerWiz" on Profile: the version and when it was last updated (the same facts as AppVersion), using
// it as an app from the Home Screen (when this browser can), and a few words on what PokerWiz is.
import { APP_VERSION, APP_COMMIT, APP_DATE } from '../../constants/version.js';
import { formatLongDate } from '../../utils/format.js';
import { InstallButton } from '../../components/InstallGuide/InstallGuide.jsx';
import SettingsSection from './SettingsSection.jsx';
import SettingsRow from './SettingsRow.jsx';
import './AppInfo.css';

export default function AppInfo({ order }) {
  return (
    <SettingsSection
      title="About PokerWiz"
      order={order}
      footnote="PokerWiz is your poker notebook: log live sessions, review your hands, practice spots with the coach, and see how you're really doing. Everything stays on your own server, and you can download all of it any time."
    >
      <SettingsRow icon="star" label="Version" value={`v${APP_VERSION}`} detail={APP_COMMIT ? `Build ${APP_COMMIT}` : undefined} />
      {APP_DATE && <SettingsRow icon="calendar" label="Updated" value={formatLongDate(APP_DATE)} />}
      {/* Nothing here once it already runs as an app, or where the browser can't install it */}
      <InstallButton className="app-info-install" />
    </SettingsSection>
  );
}
