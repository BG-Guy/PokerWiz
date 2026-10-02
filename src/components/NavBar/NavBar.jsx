// Main navigation: bottom tab bar on phones (with a raised "Play" button and a "More" panel that slides
// up out of the bar), icon rail on tablets, labelled sidebar on desktop.
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from '../Icon/Icon.jsx';
import Brand from '../Brand/Brand.jsx';
import ThemeToggle from '../ThemeToggle/ThemeToggle.jsx';
import UnitToggle from '../UnitToggle/UnitToggle.jsx';
import './NavBar.css';

// The app's sections, in menu order. "phone: false" items live in the More panel on phones.
const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'home', end: true, phone: true },
  { to: '/hands', label: 'Hands', icon: 'cards', phone: true },
  { to: '/session', label: 'Play', icon: 'play', phone: true, primary: true },
  { to: '/coach', label: 'Coach', icon: 'coach', phone: true },
  { to: '/practice', label: 'Practice', icon: 'zap', phone: false },
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

  // Close the More panel when the page changes, and on Escape.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (event) => event.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  return (
    <>
      {/* Phones: dims the page behind the open More panel; tapping it closes the panel */}
      <div className={`navbar-scrim ${moreOpen ? 'is-open' : ''}`} aria-hidden="true" onClick={() => setMoreOpen(false)} />

      <nav className={`navbar ${moreOpen ? 'is-more-open' : ''}`} aria-label="Main">
        <div className="navbar-brand">
          <Brand />
        </div>

        {/* Phones only: the remaining sections, revealed as the bar slides up */}
        <div className="navbar-more" id="navbar-more" inert={!moreOpen}>
          <div className="navbar-more-inner">
            <span className="navbar-more-title">More</span>
            <ul className="navbar-more-grid">
              {MORE_ITEMS.map((item, index) => (
                <li key={item.to} style={{ '--i': index }}>
                  <NavLink to={item.to} className="navbar-more-link">
                    <span className="navbar-more-icon">
                      <Icon name={item.icon} size={22} />
                    </span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
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

          {/* Phones only: slides the bar up to show the remaining sections */}
          <li className="navbar-item-more">
            <button
              type="button"
              className={`navbar-link ${moreIsActive || moreOpen ? 'active' : ''}`}
              aria-expanded={moreOpen}
              aria-controls="navbar-more"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <span className="navbar-link-icon">
                <Icon name={moreOpen ? 'close' : 'more'} size={22} />
              </span>
              <span className="navbar-link-label">{moreOpen ? 'Close' : 'More'}</span>
            </button>
          </li>
        </ul>

        {/* BB/$ and theme switches sit at the bottom of the sidebar (phones have them in the header) */}
        <div className="navbar-footer">
          <UnitToggle />
          <ThemeToggle showLabel />
        </div>
      </nav>
    </>
  );
}
