// Home page peek at hand highlights: the top hand from three award categories, with a link to all of them.
import { Link } from 'react-router-dom';
import { highlightPreview } from '../../utils/handHighlights.js';
import Panel from '../../components/Panel/Panel.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './HighlightsPreview.css';

export default function HighlightsPreview({ hands }) {
  const items = highlightPreview(hands, 3);

  return (
    <Panel
      title="Highlights"
      className="highlights-preview"
      action={
        <Link to="/hands/highlights" className="btn btn-ghost">
          More
        </Link>
      }
    >
      {items.length === 0 ? (
        <p className="highlights-preview-empty">Record and rate hands to earn highlights.</p>
      ) : (
        <ul className="highlights-preview-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/hands/${item.hand.id}`} className={`highlights-preview-item is-${item.id}`}>
                <span className="highlights-preview-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="highlights-preview-text">
                  <span className="highlights-preview-award">{item.title}</span>
                  <span className="highlights-preview-title">{item.hand.title}</span>
                  <span className="highlights-preview-stat">{item.stat}</span>
                </span>
                <span className="highlights-preview-cards">
                  {item.hand.holeCards.slice(0, 2).map((code) => (
                    <PlayingCard key={code} code={code} size="xs" />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
