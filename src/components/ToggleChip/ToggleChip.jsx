// On/off pill (e.g. "Downswings" on the full-screen chart): a check mark and the selected colors when on.
import Icon from '../Icon/Icon.jsx';
import './ToggleChip.css';

export default function ToggleChip({ label, on, onToggle }) {
  return (
    <button type="button" className={`toggle-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={onToggle}>
      <span className="toggle-chip-box" aria-hidden="true">
        <Icon name="check" size={12} />
      </span>
      {label}
    </button>
  );
}
