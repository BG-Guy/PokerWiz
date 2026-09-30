// Tappable card placeholder: shows the chosen card, or a dashed "+" slot when empty.
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import Icon from '../Icon/Icon.jsx';
import './CardSlot.css';

export default function CardSlot({ code, onClick, size = 'md', label = 'Card' }) {
  return (
    <button
      type="button"
      className={`card-slot card-slot-${size} ${code ? 'is-filled' : ''}`}
      onClick={onClick}
      aria-label={code ? `${label}: ${code}, tap to change` : `${label}: choose a card`}
    >
      {code ? (
        <PlayingCard code={code} size={size} />
      ) : (
        <span className="card-slot-empty">
          <Icon name="plus" size={16} />
        </span>
      )}
    </button>
  );
}
