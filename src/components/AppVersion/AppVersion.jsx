// The app's version and the commit it was built from ("v0.2.0 · 3b1eab2"), small and muted. Shown at the bottom
// of the sidebar (tablet, desktop) and of the More sheet (phones), so it's easy to tell which build is live.
import { APP_VERSION, APP_COMMIT } from '../../constants/version.js';
import './AppVersion.css';

export default function AppVersion({ className = '' }) {
  const title = `PokerWiz version ${APP_VERSION}${APP_COMMIT ? `, build ${APP_COMMIT}` : ''}`;
  return (
    <p className={`app-version ${className}`} title={title} aria-label={title}>
      <span className="app-version-number">v{APP_VERSION}</span>
      {APP_COMMIT && <span className="app-version-commit">{APP_COMMIT}</span>}
    </p>
  );
}
