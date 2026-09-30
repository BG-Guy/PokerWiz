// Main navigation: bottom tab bar on phones (with a raised "Play" button and a "More" sheet),
// icon rail on tablets, labelled sidebar on desktop.
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from '../Icon/Icon.jsx';
import Brand from '../Brand/Brand.jsx';
import ThemeToggle from '../ThemeToggle/ThemeToggle.jsx';
import MoreSheet from './MoreSheet.jsx';
import './NavBar.css';

// The app's sections, in menu order. "phone: false" items live in the More sheet on phones.
const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'home', end: true, phone: true },
  { to: '/hands', label: 'Hands', icon: 'cards', phone: true },
  { to: '/session', label: 'Play', icon: 'play', phone: true, primary: true },
  { to: '/coach', label: 'Coach', icon: 'coach', phone: true },
  { to: '/history', label: 'History', icon: 'clock', phone: false },
  { to: '/insights', label: 'Insights', icon: 'chart', phone: false },
  { to: '/goals', label: 'Goals', icon: 'target', phone: false },
  { to: '/equity', label: 'Equity', icon: 'calculator', phone: false },
];

const MORE_ITEMS = NAV_ITEMS.filter((item) => !item.phone);

export default function NavBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const moreIsActive = MORE_ITEMS.some((item) => pathname.startsWith(item.to));

  return (
    <nav className="navbar" aria-label="Main">
      <div className="navbar-brand">
        <Brand />
      </div>

      {/* Section links; NavLink adds the "active" class for the current page */}
      <ul className="navbar-links">
        {NAV_ITEMS.map((item) => (
          <li key={item.to} className={item.phone ? '' : 'navbar-item-wide'}>
            <NavLink
              to={item.to}
              end={item.end}
              className={`navbar-link ${item.primary ? 'is-primary' : ''}`}
              title={item.label}
            >
              <span className="navbar-link-icon">
                <Icon name={item.icon} size={22} />
              </span>
              <span className="navbar-link-label">{item.label}</span>
            </NavLink>
          </li>
        ))}

        {/* Phones only: opens a sheet with the remaining sections */}
        <li className="navbar-item-more">
          <button type="button" className={`navbar-link ${moreIsActive ? 'active' : ''}`} onClick={() => setMoreOpen(true)}>
            <span className="navbar-link-icon">
              <Icon name="more" size={22} />
            </span>
            <span className="navbar-link-label">More</span>
          </button>
        </li>
      </ul>

      {/* Theme switch sits at the bottom of the sidebar (phones have it in the header) */}
      <div className="navbar-footer">
        <ThemeToggle showLabel />
      </div>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={MORE_ITEMS} />
    </nav>
  );
}
