// One player in the Equity Calculator: their two cards, made hand, equity percentage and bar.
import CardSlot from '../../components/CardSlot/CardSlot.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './PlayerHandRow.css';

const percent = (value) => `${(value * 100).toFixed(1)}%`;

export default function PlayerHandRow({ index, player, result, isLeader, isStale, handName, canRemove, onPickCards, onRemove }) {
  const name = `Player ${index + 1}`;

  return (
    <li className={`equity-row ${isLeader ? 'is-leader' : ''} ${isStale ? 'is-stale' : ''}`}>
      <div className="equity-row-cards">
        {[0, 1].map((slot) => (
          <CardSlot key={slot} code={player.cards[slot]} label={`${name} card ${slot + 1}`} onClick={onPickCards} />
        ))}
      </div>

      <div className="equity-row-info">
        <div className="equity-row-head">
          <span className="equity-row-name">{name}</span>
          {player.cards.length === 0 && <span className="equity-row-tag">Random hand</span>}
          {handName && <span className="equity-row-tag is-made">{handName}</span>}
        </div>

        {/* Equity: big number, win/tie split, and a bar */}
        <div className="equity-row-numbers">
          <span className="equity-row-equity num">{result ? percent(result.equity) : '--'}</span>
          {result && (
            <span className="equity-row-split">
              Win {percent(result.win)} · Tie {percent(result.tie)}
            </span>
          )}
        </div>
        <div className="equity-row-bar">
          <span style={{ width: result ? percent(result.equity) : 0 }} />
        </div>
      </div>

      {canRemove && (
        <button type="button" className="equity-row-remove" onClick={onRemove} aria-label={`Remove ${name}`}>
          <Icon name="close" size={16} />
        </button>
      )}
    </li>
  );
}
