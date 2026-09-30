// Street-by-street replay of a hand: cards dealt on each street, pot size, and every action.
import { formatMoney } from '../../utils/format.js';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './ActionTimeline.css';

// Which board cards appear on each street (start and end index into the board array).
const STREET_CARDS = { Flop: [0, 3], Turn: [3, 4], River: [4, 5] };

// All-in actions: recorded with allIn: true, or written as "shoves" / "all in" in older hands.
const isAllIn = (action) => action.allIn || action.verb === 'shoves' || action.verb === 'all in';

export default function ActionTimeline({ streets, board }) {
  return (
    <ol className="action-timeline">
      {streets.map((street) => {
        const range = STREET_CARDS[street.name];
        const newCards = range ? board.slice(range[0], range[1]) : [];

        return (
          <li key={street.name} className="action-timeline-street">
            <div className="action-timeline-head">
              <span className="action-timeline-name">{street.name}</span>
              <span className="action-timeline-cards">
                {newCards.map((code) => (
                  <PlayingCard key={code} code={code} size="sm" />
                ))}
              </span>
              <span className="action-timeline-pot num">Pot {formatMoney(street.pot, { sign: false })}</span>
            </div>

            {/* Actions in order; the hero's own actions are highlighted, all-ins are called out in red */}
            <ul className="action-timeline-actions">
              {street.actions.map((action, index) => {
                const allIn = isAllIn(action);
                const classes = ['action-timeline-action', action.actor === 'Hero' && 'is-hero', allIn && 'is-allin'].filter(Boolean).join(' ');
                return (
                  <li key={index} className={classes}>
                    <span className="action-timeline-actor">{action.actor}</span>
                    {allIn ? (
                      <span className="action-timeline-verb">
                        <Icon name="allIn" size={18} className="action-timeline-allin-icon" />
                        {action.verb === 'calls' ? 'Calls all in' : 'All in'}
                      </span>
                    ) : (
                      <span className="action-timeline-verb">{action.verb}</span>
                    )}
                    {action.amount !== undefined && (
                      <span className="action-timeline-amount num">
                        {allIn ? 'for ' : ''}
                        {formatMoney(action.amount, { sign: false })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
