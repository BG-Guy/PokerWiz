// A small segmented switch for a Profile row (Night / Day, BB / $, buy-in depth): the picked option is a white
// pill that slides across to the one you tap.
import './SettingsSegments.css';

// options: [{ value, label }]
export default function SettingsSegments({ options, value, onChange, label }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="settings-segments" role="group" aria-label={label} style={{ '--count': options.length, '--index': index }}>
      <span className="settings-segments-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`settings-segments-option ${option.value === value ? 'is-active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
