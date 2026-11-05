// Phone-only sheet listing the sections that don't fit in the bottom tab bar, grouped (Study, Track, You), and
// (in a browser) how to use PokerWiz as an app.
import { NavLink } from 'react-router-dom';
import Modal from '../Modal/Modal.jsx';
import Icon from '../Icon/Icon.jsx';
import AppVersion from '../AppVersion/AppVersion.jsx';
import { InstallButton } from '../InstallGuide/InstallGuide.jsx';
import './MoreSheet.css';

// The items under their group heading, in the order the groups first appear.
function grouped(items) {
  const groups = [];
  for (const item of items) {
    let group = groups.find((g) => g.name === item.group);
    if (!group) groups.push((group = { name: item.group, items: [] }));
    group.items.push(item);
  }
  return groups;
}

export default function MoreSheet({ open, onClose, items }) {
  return (
    <Modal open={open} onClose={onClose} title="More">
      {grouped(items).map((group) => (
        <section key={group.name ?? 'rest'} className="more-sheet-group">
          {group.name && <h3 className="more-sheet-heading">{group.name}</h3>}
          <ul className="more-sheet-list">
            {group.items.map((item) => (
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
        </section>
      ))}
      <InstallButton className="more-sheet-install" />
      {/* Phones have no sidebar, so the version lives at the bottom of this sheet */}
      <AppVersion className="more-sheet-version" />
    </Modal>
  );
}
