// The app's version, the commit it was built from and when it was updated ("v0.4.0 · 3b1eab2", then "Updated
// Oct 12, 2026"), small and muted. Shown at the bottom of the sidebar (tablet, desktop) and of the More sheet
// (phones), so it's easy to tell which build is live.
import { APP_VERSION, APP_COMMIT, APP_DATE } from '../../constants/version.js';
import { formatLongDate } from '../../utils/format.js';
import './AppVersion.css';

export default function AppVersion({ className = '' }) {
  const updated = APP_DATE ? formatLongDate(APP_DATE) : '';
  const title = `PokerWiz version ${APP_VERSION}${APP_COMMIT ? `, build ${APP_COMMIT}` : ''}${updated ? `, updated ${updated}` : ''}`;
  return (
    <p className={`app-version ${className}`} title={title} aria-label={title}>
      <span className="app-version-number">v{APP_VERSION}</span>
      {APP_COMMIT && <span className="app-version-commit">{APP_COMMIT}</span>}
      {updated && <span className="app-version-date">Updated {updated}</span>}
    </p>
  );
}
