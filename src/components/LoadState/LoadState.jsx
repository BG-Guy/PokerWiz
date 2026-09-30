// Placeholder shown while a page loads its data, or an error message with a retry button.
import './LoadState.css';

export default function LoadState({ error, onRetry }) {
  if (error) {
    return (
      <div className="load-state" role="alert">
        <p className="load-state-title">Something went wrong</p>
        <p className="load-state-text">{error.message}</p>
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="load-state" aria-live="polite">
      <span className="load-state-spinner" />
      <span className="load-state-text">Loading</span>
    </div>
  );
}
