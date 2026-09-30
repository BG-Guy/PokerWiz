// Banner on the dashboard while a session is running: stakes, a ticking clock and a Resume link.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatClock } from '../../utils/format.js';
import Icon from '../../components/Icon/Icon.jsx';
import './LiveSessionBanner.css';

export default function LiveSessionBanner({ session }) {
  const [now, setNow] = useState(Date.now());

  // Tick once a second so the clock stays current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Link to="/session" className="live-banner">
      <span className="live-banner-dot" aria-hidden="true" />
      <span className="live-banner-main">
        <span className="live-banner-kicker">Session in progress</span>
        <span className="live-banner-title">
          {session.game} {session.stakes} · {session.venue}
        </span>
      </span>
      <span className="live-banner-clock num">{formatClock(now - new Date(session.startedAt).getTime())}</span>
      <span className="live-banner-cta">
        Resume <Icon name="chevronRight" size={16} />
      </span>
    </Link>
  );
}
