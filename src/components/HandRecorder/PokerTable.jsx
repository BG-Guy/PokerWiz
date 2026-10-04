// The poker table: felt oval, board and pot in the middle, and seats placed around the rail.
// Seats are rotated so the hero always sits at the bottom center once chosen.
import { formatMoney } from '../../utils/format.js';
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import Seat from './Seat.jsx';
import DealerButton from './DealerButton.jsx';
import './PokerTable.css';

const BOARD_SLOTS = [0, 1, 2, 3, 4];

// Point on an ellipse around the table center, in percent of the table box.
function pointOnRail(visualIndex, count, radiusX, radiusY) {
  const angle = ((90 + (visualIndex * 360) / count) * Math.PI) / 180; // 90deg = bottom, then clockwise
  return { x: 50 + radiusX * Math.cos(angle), y: 50 + radiusY * Math.sin(angle) };
}

// seats: [{ seat, position, role, name, cards, folded, bet, lastAction, isActive, isWinner }]
// bb: the big blind, for showing amounts in big blinds.
export default function PokerTable({ seats, board, pot, bb = null, rotation = 0, selectable = null, onSeatClick }) {
  const count = seats.length;
  const someoneActive = seats.some((s) => s.isActive);
  // The dealer button lies on the felt in front of the button's seat, halfway toward a neighbor so it stays
  // clear of the cards and bet chips. Seats on the right half have their name tags hanging toward the next
  // seat, so there it goes toward the previous one.
  const button = seats.find((s) => s.position === 'BTN');
  const buttonIndex = button ? (button.seat - rotation + count) % count : null;
  const onRightHalf = button && pointOnRail(buttonIndex, count, 1, 1).x > 50.3;
  const buttonPosition = button ? pointOnRail(buttonIndex + (onRightHalf ? -0.5 : 0.5), count, 31, 26) : null;

  return (
    <div className={`poker-table is-${count}-max ${someoneActive ? 'has-active' : ''}`}>
      {/* Felt with board and pot */}
      <div className="poker-table-felt">
        <div className="poker-table-center">
          <div className="poker-table-board">
            {BOARD_SLOTS.map((slot) => (
              <PlayingCard key={slot} code={board[slot]} size="sm" />
            ))}
          </div>
          {pot > 0 && (
            <div className="poker-table-pot">
              <span className="poker-table-chip" aria-hidden="true" />
              Pot <span className="num">{formatMoney(pot, { sign: false, bb })}</span>
            </div>
          )}
        </div>
      </div>

      {buttonPosition && <DealerButton position={buttonPosition} />}

      {/* Seats around the rail; bet chips sit between each seat and the center */}
      {seats.map((seat) => {
        const visualIndex = (seat.seat - rotation + count) % count;
        const position = pointOnRail(visualIndex, count, 44, 42);
        const betPosition = pointOnRail(visualIndex, count, 27, 22);
        const canSelect = selectable === 'hero' || (selectable === 'villains' && seat.role !== 'hero');
        return (
          <Seat
            key={seat.seat}
            seat={seat}
            bb={bb}
            position={position}
            betPosition={betPosition}
            selectable={canSelect}
            onClick={() => onSeatClick(seat.seat)}
          />
        );
      })}
    </div>
  );
}
