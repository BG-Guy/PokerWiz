// Tabs across the Hands area: the hand list, Highlights, hand Insights and Leaks (what the coach found across
// them). (The Equity calculator has its own place in the main navigation.)
// The Insights tab is phone/tablet only: on desktop, Highlights already shows the insights next to it.
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '../Icon/Icon.jsx';
import './HandsTabs.css';

const TABS = [
  { to: '/hands', label: 'Hands', icon: 'cards' },
  { to: '/hands/highlights', label: 'Highlights', icon: 'trophy' },
  { to: '/hands/insights', label: 'Insights', icon: 'chart', compactOnly: true },
  { to: '/leaks', label: 'Leaks', icon: 'drop' },
];

export default function HandsTabs() {
  const { pathname } = useLocation();
  // "Hands" stays selected while a single hand is open (/hands/<id>).
  const activeTo = TABS.find((tab) => tab.to !== '/hands' && pathname.startsWith(tab.to))?.to ?? '/hands';
  // On a screen too narrow for every tab the row scrolls: bring the current one into view.
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [activeTo]);

  return (
    <nav className="hands-tabs" aria-label="Hands sections">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          ref={tab.to === activeTo ? activeRef : null}
          to={tab.to}
          className={`hands-tab ${tab.to === activeTo ? 'is-active' : ''} ${tab.compactOnly ? 'is-compact-only' : ''}`}
          aria-current={tab.to === activeTo ? 'page' : undefined}
        >
          <Icon name={tab.icon} size={16} />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
