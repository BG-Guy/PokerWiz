// One recorded step of the hand ("CO raises to $6", "Flop" + cards), with a hero/villain icon when relevant.
// Used by the prompt carousel (the step that just slid away) and by the full hand log.
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import Icon from '../Icon/Icon.jsx';
import './LogEntry.css';

// entry: { text, cards?: [codes], role?: 'hero' | 'villain', allIn?: boolean }
export default function LogEntry({ entry }) {
  return (
    <span className={`log-entry ${entry.role ? `is-${entry.role}` : ''} ${entry.allIn ? 'is-allin' : ''}`}>
      {entry.role && <Icon name={entry.role} size={14} className="log-entry-icon" />}
      {entry.allIn && <Icon name="allIn" size={14} className="log-entry-allin" />}
      <span className="log-entry-text">{entry.text}</span>
      {entry.cards?.length > 0 && (
        <span className="log-entry-cards">
          {entry.cards.map((code) => (
            <PlayingCard key={code} code={code} size="xs" />
          ))}
        </span>
      )}
    </span>
  );
}
