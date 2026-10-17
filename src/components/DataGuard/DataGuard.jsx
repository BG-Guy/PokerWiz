// Keeps a copy of your data on this device (utils/deviceBackup.js) and, if the server ever comes back without
// any of it while this device still has a copy, offers to put it back. The copy is refreshed when the app opens,
// every few minutes, and when you leave the tab; it's never overwritten by a server that has none of your data.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackup, getDataStatus, importBackup } from '../../api/data.js';
import { readDeviceCopy, saveDeviceCopy, totalOf } from '../../utils/deviceBackup.js';
import { formatLongDate, formatTime, plural } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import './DataGuard.css';

const REFRESH_MS = 5 * 60 * 1000;

// "12 sessions, 30 hands and 2 goals"
function describe(counts) {
  const parts = [plural(counts.sessions, 'session'), plural(counts.hands, 'hand'), plural(counts.goals, 'goal')].filter((p) => !p.startsWith('0 '));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] ?? 'nothing';
}

export default function DataGuard() {
  const [offer, setOffer] = useState(null); // the device copy, when the server has none of your data
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null);
  const busy = useRef(false);

  // Compare the server with this device: refresh the copy, or offer it back.
  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [status, copy] = await Promise.all([getDataStatus(), readDeviceCopy()]);
      if (totalOf(status.userData) === 0) {
        setOffer(totalOf(copy?.counts) > 0 ? copy : null);
        return;
      }
      setOffer(null);
      await saveDeviceCopy(await getBackup(), status.userData);
    } catch {
      // offline or the server is waking up: try again next time
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, REFRESH_MS);
    const onHide = () => document.visibilityState === 'hidden' && check();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [check]);

  // Put the copy back (it replaces what's on the server: the sample data), then reload every page's data.
  async function restore() {
    setRestoring(true);
    setError(null);
    try {
      await importBackup(offer.backup, { mode: 'replace' });
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setRestoring(false);
    }
  }

  if (!offer) return null;
  return (
    <section className="data-guard" role="alert">
      <Icon name="alert" size={20} />
      <div className="data-guard-text">
        <strong>Your data isn't on the server, but this device has a copy</strong>
        <p>
          Saved {formatLongDate(offer.savedAt.slice(0, 10))} at {formatTime(offer.savedAt)}: {describe(offer.counts)}. If an update
          reset the server, put it back. (If you deleted everything on purpose, ignore this.)
        </p>
        {error && <p className="data-guard-error">{error}</p>}
      </div>
      <div className="data-guard-actions">
        <button type="button" className="btn" onClick={restore} disabled={restoring}>
          <Icon name="upload" size={16} /> {restoring ? 'Putting it back...' : 'Put my data back'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOffer(null)} disabled={restoring}>
          Not now
        </button>
      </div>
    </section>
  );
}
