// Card-style container with an optional title row and action (e.g. a "See all" link).
import './Panel.css';

export default function Panel({ title, action, className = '', children }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-header">
          {title && <h2 className="panel-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
