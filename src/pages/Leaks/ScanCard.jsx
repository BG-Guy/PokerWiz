// The leak scan's progress, as a card at the top of Leaks: what it's doing, how far along, and a pause button
// (it works while the page is open). Gone once the scan has finished.
import Icon from '../../components/Icon/Icon.jsx';
import './ScanCard.css';

// scan: from useLeakScan ({ running, paused, phase, done, total, title, error, pause, resume }).
export default function ScanCard({ scan }) {
  if (!scan.running && !scan.error) return null;
  const share = scan.total ? scan.done / scan.total : 0;
  const title = scan.error ? 'The scan stopped' : scan.phase === 'deepen' ? 'Going deeper on the flop, turn and river' : 'Reading your hands';
  const text = scan.error ?? (scan.paused ? 'Paused' : scan.title ?? (scan.phase === 'deepen' ? 'Biggest pots first' : 'A quick first look at each hand'));

  return (
    <section className={`scan-card ${scan.error ? 'is-error' : ''}`} aria-live="polite">
      <span className={`scan-card-icon ${scan.running && !scan.paused ? 'is-working' : ''}`}>
        <Icon name={scan.error ? 'alert' : 'zap'} size={18} />
      </span>
      <div className="scan-card-main">
        <p className="scan-card-title">{title}</p>
        <p className="scan-card-text">{text}</p>
        {!scan.error && (
          <span className="scan-card-track" role="progressbar" aria-valuemin={0} aria-valuemax={scan.total} aria-valuenow={scan.done}>
            <span className="scan-card-fill" style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
        )}
      </div>
      {!scan.error && (
        <>
          <span className="scan-card-count num">
            {scan.done} / {scan.total}
          </span>
          <button type="button" className="btn btn-ghost scan-card-button" onClick={scan.paused ? scan.resume : scan.pause}>
            {scan.paused ? 'Resume' : 'Pause'}
          </button>
        </>
      )}
    </section>
  );
}
