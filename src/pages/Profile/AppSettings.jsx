// "App settings" on Profile: night or day theme, amounts in big blinds or dollars, and the buy-in a new session
// suggests. Theme and amounts are kept on this device; the buy-in is saved with your profile.
import { useTheme } from '../../theme/ThemeContext.jsx';
import { useUnit } from '../../theme/UnitContext.jsx';
import SettingsSection from './SettingsSection.jsx';
import SettingsRow from './SettingsRow.jsx';
import SettingsSegments from './SettingsSegments.jsx';

const THEMES = [
  { value: 'dark', label: 'Night' },
  { value: 'light', label: 'Day' },
];
const UNITS = [
  { value: 'bb', label: 'BB' },
  { value: '$', label: '$' },
];
const DEPTHS = [50, 100, 200].map((depth) => ({ value: depth, label: `${depth}` }));

// buyInDepth: the saved one; onDepth(depth) saves a new one.
export default function AppSettings({ buyInDepth, onDepth, order }) {
  const { theme, toggleTheme } = useTheme();
  const { unit, setUnit } = useUnit();
  return (
    <SettingsSection title="App settings" order={order}>
      <SettingsRow icon={theme === 'dark' ? 'moon' : 'sun'} label="Appearance">
        <SettingsSegments label="Appearance" options={THEMES} value={theme} onChange={(next) => next !== theme && toggleTheme()} />
      </SettingsRow>
      <SettingsRow icon="calculator" label="Show amounts in" detail={unit === 'bb' ? 'Big blinds' : 'Dollars'}>
        <SettingsSegments label="Show amounts in" options={UNITS} value={unit} onChange={setUnit} />
      </SettingsRow>
      <SettingsRow icon="play" label="Starting buy-in" detail="Big blinds, new sessions">
        <SettingsSegments label="Starting buy-in in big blinds" options={DEPTHS} value={buyInDepth} onChange={onDepth} />
      </SettingsRow>
    </SettingsSection>
  );
}
