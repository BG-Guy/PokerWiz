// One row in a Profile section: an icon tile, a label (with an optional line under it), and on the right either
// a value with a chevron (the row is a button: onClick) or a control (children), like a switch.
import Icon from '../../components/Icon/Icon.jsx';
import './SettingsRow.css';

export default function SettingsRow({ icon, label, detail, value, onClick, children }) {
  const inner = (
    <>
      {icon && (
        <span className="settings-row-icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {detail && <span className="settings-row-detail">{detail}</span>}
      </span>
      {value !== undefined && <span className={`settings-row-value ${value ? '' : 'is-empty'}`}>{value || 'Add'}</span>}
      {onClick && <Icon name="chevronRight" size={18} className="settings-row-chevron" />}
      {children && <span className="settings-row-control">{children}</span>}
    </>
  );

  // A row you tap is a button; one holding a control is a plain row.
  return onClick ? (
    <button type="button" className="settings-row is-button" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="settings-row">{inner}</div>
  );
}
