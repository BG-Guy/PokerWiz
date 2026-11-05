// One graded decision in a leak's list: your cards, what kind of spot it was, what you did against what GTO does,
// and what it cost. Tap it for the spot's sheet.
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import GradeBadge from '../../components/GradeBadge/GradeBadge.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import { spotTitle } from '../../coach/spots.js';
import { youVsGtoLine, lossText } from '../../coach/leakDetails.js';
import { formatDate } from '../../utils/format.js';
import './SpotRow.css';

// row: a collected decision (leaks.js collectRows): the packed decision plus the saved hand it came from.
export default function SpotRow({ row, onOpen }) {
  const { hand } = row;
  return (
    <button type="button" className="spot-row" onClick={() => onOpen(row)} aria-haspopup="dialog">
      <span className="spot-row-cards">
        {(hand.holeCards ?? []).map((code) => (
          <PlayingCard key={code} code={code} size="xs" />
        ))}
      </span>
      <span className="spot-row-main">
        <span className="spot-row-title">{spotTitle(row)}</span>
        <span className="spot-row-line">{youVsGtoLine(row)}</span>
        <span className="spot-row-meta">
          {formatDate(hand.date)} &middot; {hand.stakes}
        </span>
      </span>
      <span className="spot-row-end">
        <span className={`spot-row-loss num ${row.loss > 0 ? 'is-negative' : ''}`}>{lossText(row.loss)}</span>
        <GradeBadge score={row.score} size="xs" />
      </span>
      <Icon name="chevronRight" size={18} className="spot-row-chevron" />
    </button>
  );
}
