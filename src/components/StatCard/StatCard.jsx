// Small tile showing one headline number (e.g. net profit) with a label and a hint line.
import Icon from '../Icon/Icon.jsx';
import './StatCard.css';

// tone: "positive" | "negative" | undefined, colors the value.
export default function StatCard({ label, value, hint, icon, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {icon && (
          <span className="stat-card-icon">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div className={`stat-card-value num ${tone ? `is-${tone}` : ''}`}>{value}</div>
      {hint && <div className="stat-card-hint">{hint}</div>}
    </div>
  );
}
