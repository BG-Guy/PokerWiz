// Street-by-street replay of a hand: cards dealt on each street, pot size, and every action. Your actions carry
// the coach's grade when the hand has been graded: tap one for that decision's sheet.
import { Link } from 'react-router-dom';
import { formatMoney } from '../../utils/format.js';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import GradeBadge from '../../components/GradeBadge/GradeBadge.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './ActionTimeline.css';

// Where each of your actions falls among your decisions ("Flop:1" -> 2): the coach numbers them in order.
function heroDecisionIndexes(streets) {
  const indexes = new Map();
  let next = 0;
  for (const street of streets) {
    street.actions.forEach((action, i) => {
      if (action.actor === 'Hero') indexes.set(`${street.name}:${i}`, next++);
    });
  }
  return indexes;
}

// Which board cards appear on each street (start and end index into the board array).
const STREET_CARDS = { Flop: [0, 3], Turn: [3, 4], River: [4, 5] };

// All-in actions: recorded with allIn: true, or written as "shoves" / "all in" in older hands.
const isAllIn = (action) => action.allIn || action.verb === 'shoves' || action.verb === 'all in';

// replayLink(streetName): link to replay the hand from that street in Practice, or null.
// grades: Map(your decision number -> its graded row, from the coach's leak record); onGrade(row) opens it.
export default function ActionTimeline({ streets, board, bb = null, replayLink = null, grades = null, onGrade = null }) {
  const heroIndexes = grades ? heroDecisionIndexes(streets) : null;
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
              <span className="action-timeline-pot num">Pot {formatMoney(street.pot, { sign: false, bb })}</span>
              {replayLink?.(street.name) && (
                <Link to={replayLink(street.name)} className="action-timeline-replay">
                  <Icon name="undo" size={14} /> Replay from here
                </Link>
              )}
            </div>

            {/* Actions in order; the hero's own actions are highlighted, all-ins are called out in red */}
            <ul className="action-timeline-actions">
              {street.actions.map((action, index) => {
                const allIn = isAllIn(action);
                const graded = heroIndexes && action.actor === 'Hero' ? grades.get(heroIndexes.get(`${street.name}:${index}`)) : null;
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
                        {formatMoney(action.amount, { sign: false, bb })}
                      </span>
                    )}
                    {graded && (
                      <button type="button" className="action-timeline-grade" onClick={() => onGrade?.(graded)} aria-haspopup="dialog" aria-label="See how the coach graded this decision">
                        <GradeBadge score={graded.score} size="xs" />
                        <Icon name="chevronRight" size={14} />
                      </button>
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
