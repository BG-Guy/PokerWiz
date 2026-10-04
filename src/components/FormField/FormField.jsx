// A labeled field for the edit sheets (hands, sessions, goals): the label, the control, and an optional hint.
// The controls themselves use the classes in FormField.css: form-input (text, number, date, select,
// textarea), form-money (a $ in front), and form-grid to put short fields side by side.
import './FormField.css';

export default function FormField({ label, htmlFor, hint, children, className = '' }) {
  return (
    <div className={`form-field ${className}`}>
      {htmlFor ? (
        <label className="form-field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="form-field-label">{label}</span>
      )}
      {children}
      {hint && <span className="form-field-hint">{hint}</span>}
    </div>
  );
}
