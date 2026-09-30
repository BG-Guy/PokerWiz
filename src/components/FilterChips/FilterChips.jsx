// Row of pill buttons for picking one filter value. Scrolls sideways on narrow screens.
import './FilterChips.css';

// options: [{ value, label, count? }]
export default function FilterChips({ options, value, onChange, label }) {
  return (
    <div className="filter-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-chip ${option.value === value ? 'is-active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="filter-chip-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
