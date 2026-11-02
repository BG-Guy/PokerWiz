// Tabs across the Hands area: the hand list, Highlights and hand Insights. (The Equity calculator has its own
// place in the main navigation.)
// The Insights tab is phone/tablet only: on desktop, Highlights already shows the insights next to it.
import { Link, useLocation } from 'react-router-dom';
import Icon from '../Icon/Icon.jsx';
import './HandsTabs.css';

const TABS = [
  { to: '/hands', label: 'Hands', icon: 'cards' },
  { to: '/hands/highlights', label: 'Highlights', icon: 'trophy' },
  { to: '/hands/insights', label: 'Insights', icon: 'chart', compactOnly: true },
];

export default function HandsTabs() {
  const { pathname } = useLocation();
  // "Hands" stays selected while a single hand is open (/hands/<id>).
  const activeTo = TABS.find((tab) => tab.to !== '/hands' && pathname.startsWith(tab.to))?.to ?? '/hands';

  return (
    <nav className="hands-tabs" aria-label="Hands sections">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
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
