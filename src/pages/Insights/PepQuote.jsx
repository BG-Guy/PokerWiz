// A short line of encouragement that fits how things are going (in a downswing, at a peak, or steady).
import './PepQuote.css';

const CAPTIONS = { downswing: 'For the downswing', peak: 'While you run good', steady: 'Keep going', early: 'Just getting started' };

// pep: pepTalk() from utils/sessionInsights.js.
export default function PepQuote({ pep }) {
  return (
    <figure className={`pep-quote is-${pep.mood}`}>
      <span className="pep-quote-mark" aria-hidden="true">
        &ldquo;
      </span>
      <blockquote className="pep-quote-text">{pep.text}</blockquote>
      <figcaption className="pep-quote-caption">{CAPTIONS[pep.mood]}</figcaption>
    </figure>
  );
}
