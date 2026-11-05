// One row of a drill-down list: tap it and you land somewhere that makes sense for what it says (a country
// opens its cities, a team its players). A leading icon or badge, a title and a line under it, a value on the
// right (with a thin meter under the title for "how much") and a chevron. A link when it has `to`, otherwise a
// button. Made to be thumb-sized: at least 64px tall.
import { Link } from 'react-router-dom';
import Icon from '../Icon/Icon.jsx';
import './DrillRow.css';

// to | onClick: where it goes. icon: a name from Icon, or lead: any element (a grade badge, cards).
// value: the number on the right; tone: "positive" | "negative"; meter: 0..1, a bar under the title;
// hint: small text under the value. selected: marks the current choice in a picker.
export default function DrillRow({ to, onClick, icon, lead, title, subtitle, value, tone, meter, hint, selected = false, chevron = true, className = '', ref, ...rest }) {
  const content = (
    <>
      {(icon || lead) && <span className="drill-row-lead">{lead ?? <Icon name={icon} size={18} />}</span>}
      <span className="drill-row-main">
        <span className="drill-row-title">{title}</span>
        {subtitle && <span className="drill-row-subtitle">{subtitle}</span>}
        {meter !== undefined && (
          <span className="drill-row-meter" aria-hidden="true">
            <span className="drill-row-meter-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, meter)) * 100)}%` }} />
          </span>
        )}
      </span>
      {(value !== undefined || hint) && (
        <span className="drill-row-end">
          {value !== undefined && <span className={`drill-row-value num ${tone ? `is-${tone}` : ''}`}>{value}</span>}
          {hint && <span className="drill-row-hint">{hint}</span>}
        </span>
      )}
      {chevron && <Icon name="chevronRight" size={18} className="drill-row-chevron" />}
    </>
  );
  const classes = `drill-row ${selected ? 'is-selected' : ''} ${className}`;
  if (to) {
    return (
      <Link to={to} className={classes} ref={ref} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} ref={ref} aria-pressed={selected || undefined} {...rest}>
      {content}
    </button>
  );
}
