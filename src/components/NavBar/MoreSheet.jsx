// Phone-only sheet listing the sections that don't fit in the bottom tab bar.
import { NavLink } from 'react-router-dom';
import Modal from '../Modal/Modal.jsx';
import Icon from '../Icon/Icon.jsx';
import './MoreSheet.css';

export default function MoreSheet({ open, onClose, items }) {
  return (
    <Modal open={open} onClose={onClose} title="More">
      <ul className="more-sheet-list">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className="more-sheet-link" onClick={onClose}>
              <span className="more-sheet-icon">
                <Icon name={item.icon} size={20} />
              </span>
              <span className="more-sheet-label">{item.label}</span>
              <Icon name="chevronRight" size={18} />
            </NavLink>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
