// Tilt scale 1-5 with faces, from "Zen" to "Full tilt". Pick a face; a marker slides along the color bar.
// readOnly shows just the face and label (used in session history).
import TiltFace, { TILT_COLORS } from './TiltFace.jsx';
import './TiltMeter.css';

export const TILT_LEVELS = [
  { level: 1, label: 'Zen', description: 'Clear head, every decision felt right.' },
  { level: 2, label: 'Calm', description: 'Mostly focused, a few small wobbles.' },
  { level: 3, label: 'Uneasy', description: 'Some bad beats got under my skin.' },
  { level: 4, label: 'Frustrated', description: 'I made a few emotional plays.' },
  { level: 5, label: 'Full tilt', description: 'I lost control of my game.' },
];

export default function TiltMeter({ value, onChange, readOnly = false }) {
  if (readOnly) {
    const level = TILT_LEVELS[value - 1];
    return (
      <span className="tilt-meter-compact">
        <TiltFace level={value} size={20} />
        {level.label}
      </span>
    );
  }

  const selected = value ? TILT_LEVELS[value - 1] : null;

  // Arrow keys move between faces, like a radio group.
  const handleKeyDown = (event) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    onChange(Math.min(5, Math.max(1, (value ?? 3) + delta)));
  };

  return (
    <div className="tilt-meter">
      <div className="tilt-meter-faces" role="radiogroup" aria-label="Tilt level" onKeyDown={handleKeyDown}>
        {TILT_LEVELS.map(({ level, label }) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            tabIndex={value === level || (!value && level === 1) ? 0 : -1}
            className={`tilt-meter-face ${value === level ? 'is-selected' : ''}`}
            style={{ '--face-color': TILT_COLORS[level - 1] }}
            onClick={() => onChange(level)}
          >
            <TiltFace level={level} size={44} />
            <span className="tilt-meter-face-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Color bar from calm to tilt, with a marker under the chosen face */}
      <div className="tilt-meter-bar" aria-hidden="true">
        {value && <span className="tilt-meter-marker" style={{ left: `${(value - 0.5) * 20}%` }} />}
      </div>

      <p className="tilt-meter-description">{selected ? selected.description : 'How tilted did you feel this session?'}</p>
    </div>
  );
}
