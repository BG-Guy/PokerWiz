// Pill buttons for an optional choice in the profile sheet (usual stakes, favorite game): tap one to pick it,
// tap it again to leave the choice empty ('').
// Uses the filter chips' look.
import '../../components/FilterChips/FilterChips.css';

// options: [{ value, label }]
export default function ChoiceChips({ options, value, onChange, label }) {
  return (
    <div className="filter-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-chip ${option.value === value ? 'is-active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value === value ? '' : option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
