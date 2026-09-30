// The poker table: felt oval, board and pot in the middle, and seats placed around the rail.
// Seats are rotated so the hero always sits at the bottom center once chosen.
import { formatMoney } from '../../utils/format.js';
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import Seat from './Seat.jsx';
import './PokerTable.css';

const BOARD_SLOTS = [0, 1, 2, 3, 4];

// Point on an ellipse around the table center, in percent of the table box.
function pointOnRail(visualIndex, count, radiusX, radiusY) {
  const angle = ((90 + (visualIndex * 360) / count) * Math.PI) / 180; // 90deg = bottom, then clockwise
  return { x: 50 + radiusX * Math.cos(angle), y: 50 + radiusY * Math.sin(angle) };
}

// seats: [{ seat, position, role, name, cards, folded, bet, lastAction, isActive, isWinner }]
export default function PokerTable({ seats, board, pot, rotation = 0, selectable = null, onSeatClick }) {
  const count = seats.length;
  const someoneActive = seats.some((s) => s.isActive);

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
              Pot <span className="num">{formatMoney(pot, { sign: false })}</span>
            </div>
          )}
        </div>
      </div>

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
