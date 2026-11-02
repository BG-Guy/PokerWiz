// The "working on it" state in Coach and Practice (dealing, solving, grading): a slowly turning gold ring around
// a crimson spade, the step in progress, a line about what's happening, and a thin shimmering track.
import './EliteThinking.css';

export default function EliteThinking({ title, text }) {
  return (
    <div className="elite-thinking" aria-live="polite">
      <span className="elite-thinking-orb" aria-hidden="true">
        <span className="elite-thinking-ring" />
        <svg className="elite-thinking-spade" viewBox="0 0 24 24" width="22" height="22">
          <path d="M12 3c2.6 3.1 7 5.4 7 9a3.6 3.6 0 0 1-6 2.6l.9 3.9h-3.8l.9-3.9A3.6 3.6 0 0 1 5 12c0-3.6 4.4-5.9 7-9z" fill="currentColor" />
        </svg>
      </span>
      <p className="elite-thinking-title">{title}</p>
      {text && <p className="elite-thinking-text">{text}</p>}
      <span className="elite-thinking-track" aria-hidden="true" />
    </div>
  );
}
