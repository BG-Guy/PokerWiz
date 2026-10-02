// Building blocks shared by the edit sheets (Edit hand, Edit session): a labelled field,
// a dollar amount input, and the footer with Delete on the left and Save on the right.
import Icon from '../Icon/Icon.jsx';
import './EditForm.css';

// One labelled field. `htmlFor` ties the label to a single input; without it the label names a group.
export function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="edit-form-field">
      {htmlFor ? (
        <label className="edit-form-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="edit-form-label">{label}</span>
      )}
      {children}
      {hint && <span className="edit-form-hint">{hint}</span>}
    </div>
  );
}

// Dollar amount (string while typing).
export function MoneyInput({ id, value, onChange, label }) {
  return (
    <label className="edit-form-money" htmlFor={id}>
      <span aria-hidden="true">$</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

// Error line plus the sheet's buttons. Delete asks for confirmation first.
export function EditFormFooter({ error, saving, onDelete, deleteLabel = 'Delete', confirmText, children }) {
  const handleDelete = () => {
    if (window.confirm(confirmText)) onDelete();
  };
  return (
    <>
      {error && (
        <p className="edit-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="edit-form-footer">
        {onDelete && (
          <button type="button" className="btn btn-ghost edit-form-delete" onClick={handleDelete} disabled={saving}>
            <Icon name="trash" size={16} /> {deleteLabel}
          </button>
        )}
        {children}
        <button type="submit" className="btn edit-form-save" disabled={saving}>
          <Icon name="check" size={16} /> {saving ? 'Saving' : 'Save changes'}
        </button>
      </div>
    </>
  );
}
