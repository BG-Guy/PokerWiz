// Switch between showing money in big blinds and in dollars.
import { useUnit } from '../../theme/UnitContext.jsx';
import './UnitToggle.css';

export default function UnitToggle({ showLabel = false }) {
  const { unit, setUnit } = useUnit();
  return (
    <div className="unit-toggle" role="group" aria-label="Show amounts in">
      {showLabel && <span className="unit-toggle-label">Amounts</span>}
      {[
        ['bb', 'BB'],
        ['$', '$'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`unit-toggle-option ${unit === value ? 'is-active' : ''}`}
          aria-pressed={unit === value}
          title={value === 'bb' ? 'Show amounts in big blinds' : 'Show amounts in dollars'}
          onClick={() => setUnit(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
