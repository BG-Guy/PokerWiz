// PokerWiz logo: a teal spade badge plus the wordmark. Links back to the dashboard.
import { Link } from 'react-router-dom';
import './Brand.css';

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="PokerWiz home">
      <span className="brand-mark">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2s-8 6.2-8 11.2c0 2.6 2 4.3 4.3 4.3 1.3 0 2.5-.6 3.2-1.5-.2 2-1 3.6-2.5 5h6c-1.5-1.4-2.3-3-2.5-5 .7.9 1.9 1.5 3.2 1.5 2.3 0 4.3-1.7 4.3-4.3C20 8.2 12 2 12 2z"
          />
        </svg>
      </span>
      <span className="brand-name">
        Poker<span className="brand-name-accent">Wiz</span>
      </span>
    </Link>
  );
}
