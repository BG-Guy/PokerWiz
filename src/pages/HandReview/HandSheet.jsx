// The short version of a hand, in a sheet (what a hand opens in the list on a phone): your cards and the board,
// the result, how you judged it, the action in a line a street, and the ways on: the full hand (the street-by-
// street replay, your review, editing) or the coach.
import { handSummary } from '../../utils/handDetails.js';
import { coachSupport } from '../../coach/savedHand.js';
import Modal from '../../components/Modal/Modal.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import './HandSheet.css';

const BOARD_SLOTS = [0, 1, 2, 3, 4];

// hand: the hand to show (kept by the caller while the sheet slides closed). search: the list's filters, carried
// along to the full hand so Back returns to the same list.
export default function HandSheet({ hand, open, onClose, search = '' }) {
  if (!hand) return null;
  const detail = handSummary(hand, { canCoach: coachSupport(hand).ok });
  // The way on keeps the list's filters in the address.
  const withSearch = { ...detail, sections: detail.sections.map((s) => (s.type === 'actions' ? { ...s, items: s.items.map((item) => (item.to.startsWith('/hands/') ? { ...item, to: `${item.to}${search}` } : item)) } : s)) };

  return (
    <Modal open={open} onClose={onClose} title={hand.title} className="hand-sheet">
      {/* The cards on felt: yours, then the board */}
      <div className="hand-sheet-table">
        <div className="hand-sheet-cards" aria-label="Your hand">
          {hand.holeCards.map((code) => (
            <PlayingCard key={code} code={code} />
          ))}
        </div>
        <div className="hand-sheet-cards is-board" aria-label="Board">
          {BOARD_SLOTS.map((slot) => (
            <PlayingCard key={slot} code={hand.board[slot]} size="sm" />
          ))}
        </div>
      </div>
      <StatDetail detail={withSearch} onNavigate={onClose} />
    </Modal>
  );
}
