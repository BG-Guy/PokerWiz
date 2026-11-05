// A seat's name on a small rounded tile ("BTN", "UTG+1"): the lead of rows and cards that are about a position.
import './SeatBadge.css';

// size: 'md' (list rows) or 'lg' (the summary card).
export default function SeatBadge({ position, size = 'md' }) {
  return <span className={`rg-seat is-${size}`}>{position}</span>;
}
