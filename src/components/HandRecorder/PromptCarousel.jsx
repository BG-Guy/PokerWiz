// Vertical carousel under the poker table. Each answer slides the current question up and away
// (it stays above, small and faded) while the next question slides up from below.
// Undo plays it in reverse. Keys change with every step, so React remounts and re-runs the animations.
import Icon from '../Icon/Icon.jsx';
import LogEntry from './LogEntry.jsx';
import './PromptCarousel.css';

export default function PromptCarousel({ stepKey, direction, previous, canUndo, onUndo, children }) {
  return (
    <div className={`prompt-carousel is-${direction}`}>
      <div className="prompt-carousel-top">
        {previous ? (
          <div key={`prev-${stepKey}`} className="prompt-carousel-prev">
            <Icon name="check" size={14} className="prompt-carousel-check" />
            <LogEntry entry={previous} />
          </div>
        ) : (
          <span />
        )}
        {canUndo && (
          <button type="button" className="prompt-carousel-undo" onClick={onUndo}>
            <Icon name="undo" size={14} /> Undo
          </button>
        )}
      </div>

      <div key={`card-${stepKey}`} className="prompt-carousel-card">
        {children}
      </div>
    </div>
  );
}
