// One insight as a tappable card: a label with an icon, the headline (a number or a short verdict), one plain
// sentence about it, and a cue at the bottom ("See more" unless `cta` says otherwise). Opens the insight's
// detailed view.
import Icon from '../Icon/Icon.jsx';
import './InsightCard.css';

// tone: "positive" | "negative" | undefined, colors the headline. ref: the card (where the detail grows from).
export default function InsightCard({ label, icon, value, tone, sentence, onOpen, cta = 'See more', ref }) {
  return (
    <button type="button" className={`insight-card ${tone ? `is-${tone}` : ''}`} onClick={onOpen} ref={ref} aria-haspopup="dialog">
      <span className="insight-card-top">
        <span className="insight-card-icon">
          <Icon name={icon} size={16} />
        </span>
        <span className="insight-card-label">{label}</span>
        <Icon name="chevronRight" size={18} className="insight-card-chevron" />
      </span>
      <span className="insight-card-value num">{value}</span>
      <span className="insight-card-sentence">{sentence}</span>
      {cta && <span className="insight-card-more">{cta}</span>}
    </button>
  );
}
