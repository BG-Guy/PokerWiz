// Button that switches between light and dark themes.
import { useTheme } from '../../theme/ThemeContext.jsx';
import Icon from '../Icon/Icon.jsx';
import './ThemeToggle.css';

export default function ThemeToggle({ showLabel = false }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      <span className="theme-toggle-icon">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </span>
      {showLabel && <span className="theme-toggle-label">{nextTheme === 'dark' ? 'Dark mode' : 'Light mode'}</span>}
    </button>
  );
}
