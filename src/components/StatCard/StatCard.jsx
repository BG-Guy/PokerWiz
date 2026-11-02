// Small tile showing one headline number (e.g. net profit) with a label and a hint line. With onOpen it becomes
// a button (lifts on hover, chevron in the corner) that opens a detailed view of the number.
import Icon from '../Icon/Icon.jsx';
import './StatCard.css';

// tone: "positive" | "negative" | undefined, colors the value. ref: the card element (where a detail view grows from).
export default function StatCard({ label, value, hint, icon, tone, onOpen, ref }) {
  // Spans inside, so the same markup is valid in a button.
  const content = (
    <>
      <span className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {icon && (
          <span className="stat-card-icon">
            <Icon name={icon} size={16} />
          </span>
        )}
      </span>
      <span className={`stat-card-value num ${tone ? `is-${tone}` : ''}`}>{value}</span>
      {hint && <span className="stat-card-hint">{hint}</span>}
    </>
  );

  if (!onOpen) {
    return (
      <div className="stat-card" ref={ref}>
        {content}
      </div>
    );
  }
  // Clickable: a real button, so Enter and Space work and screen readers announce it.
  return (
    <button type="button" className="stat-card is-clickable" onClick={onOpen} ref={ref} aria-haspopup="dialog" aria-label={`${label}: ${value}. Show details`}>
      {content}
      <span className="stat-card-more" aria-hidden="true">
        Details <Icon name="chevronRight" size={14} />
      </span>
    </button>
  );
}
