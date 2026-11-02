// "At the table" on Profile: your home casino, usual stakes, favorite game and how long you've played. Tapping
// any of them opens the profile sheet.
import { GAMES } from '../../constants/poker.js';
import SettingsSection from './SettingsSection.jsx';
import SettingsRow from './SettingsRow.jsx';

const THIS_YEAR = new Date().getFullYear();

// "Since 2015 · 11 years"
function sinceText(year) {
  if (!year) return '';
  const years = THIS_YEAR - year;
  return years >= 1 ? `${year} · ${years} ${years === 1 ? 'year' : 'years'}` : String(year);
}

export default function UserInfo({ settings, onEdit, order }) {
  return (
    <SettingsSection title="At the table" order={order} footnote="Your usual stakes and game are picked for you when you start a session.">
      <SettingsRow icon="flag" label="Home casino" value={settings.homeCasino} onClick={onEdit} />
      <SettingsRow icon="coins" label="Usual stakes" value={settings.usualStakes} onClick={onEdit} />
      <SettingsRow icon="cards" label="Favorite game" value={GAMES.find((g) => g.value === settings.favoriteGame)?.label ?? ''} onClick={onEdit} />
      <SettingsRow icon="clock" label="Playing since" value={sinceText(settings.playingSince)} onClick={onEdit} />
    </SettingsSection>
  );
}
