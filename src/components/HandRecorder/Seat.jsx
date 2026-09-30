// One seat at the table: cards (face up if known, branded back if not), hero/villain avatar,
// name + position, last action bubble, "to act" highlight, and the chips bet this street.
import { formatMoney } from '../../utils/format.js';
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import Icon from '../Icon/Icon.jsx';
import './Seat.css';

// Short bubble text for the last action: "Raise $6", "Check".
const ACTION_WORDS = { folds: 'Fold', checks: 'Check', calls: 'Call', bets: 'Bet', 'raises to': 'Raise', 're-raises to': 'Raise' };
function actionBubble({ verb, amount, allIn }) {
  if (allIn) return `All in ${formatMoney(amount, { sign: false })}`;
  const word = ACTION_WORDS[verb] ?? verb.replace(' to', '').replace(/^\w/, (c) => c.toUpperCase());
  return amount ? `${word} ${formatMoney(amount, { sign: false })}` : word;
}

export default function Seat({ seat, position, betPosition, selectable, onClick }) {
  const { role, name, cards = [], badge, stack, allIn, folded, bet, lastAction, isActive, isWinner } = seat;
  const classes = [
    'seat',
    `is-${role ?? 'empty'}`,
    folded && 'is-folded',
    isActive && 'is-active',
    isWinner && 'is-winner',
    selectable && 'is-selectable',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {/* Coach mode: the read on this player ("LAG", "Nit · Tilted") */}
      {badge && <span className="seat-badge">{badge}</span>}

      {/* Cards: known ones face up, unknown ones show the PokerWiz back */}
      {role && !folded && (
        <span className="seat-cards">
          {[0, 1].map((i) => (cards[i] ? <PlayingCard key={i} code={cards[i]} size="xs" /> : <PlayingCard key={i} faceDown size="xs" />))}
        </span>
      )}

      <span className="seat-avatar">{role ? <Icon name={role} size={22} /> : <Icon name="plus" size={16} />}</span>

      <span className="seat-label">
        {name && <span className="seat-name">{name}</span>}
        <span className="seat-position">{seat.position}</span>
        {allIn ? (
          <span className="seat-stack is-allin">All in</span>
        ) : (
          stack != null && <span className="seat-stack num">{formatMoney(stack, { sign: false })}</span>
        )}
      </span>

      {isActive && <span className="seat-flag">To act</span>}
      {!isActive && lastAction && <span className={`seat-bubble ${lastAction.allIn ? 'is-allin' : ''}`}>{actionBubble(lastAction)}</span>}
    </>
  );

  const style = { left: `${position.x}%`, top: `${position.y}%` };

  return (
    <>
      {selectable ? (
        <button type="button" className={classes} style={style} onClick={onClick} aria-label={`${seat.position} seat${name ? `, ${name}` : ''}`}>
          {content}
        </button>
      ) : (
        <div className={classes} style={style}>
          {content}
        </div>
      )}

      {/* Chips in front of the seat for this street's bet */}
      {bet > 0 && !folded && (
        <span className="seat-bet num" style={{ left: `${betPosition.x}%`, top: `${betPosition.y}%` }}>
          <span className="seat-bet-chip" aria-hidden="true" />
          {formatMoney(bet, { sign: false })}
        </span>
      )}
    </>
  );
}
