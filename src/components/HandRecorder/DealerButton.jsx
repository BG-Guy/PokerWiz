// The dealer button: a white acrylic puck with a beveled edge, "DEALER" around the rim and a big D, lying
// on the felt in front of the button's seat (placed by PokerTable.jsx).
import { useId } from 'react';
import './DealerButton.css';

export default function DealerButton({ position }) {
  // Gradient and path ids must be unique on the page (several tables can be on screen).
  const id = useId().replace(/:/g, '');
  return (
    <span className="dealer-button" style={{ left: `${position.x}%`, top: `${position.y}%` }} role="img" aria-label="Dealer button">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-face`} cx="40%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f2f4f3" />
            <stop offset="100%" stopColor="#d9dfdd" />
          </radialGradient>
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8ecea" />
            <stop offset="100%" stopColor="#a9b3b0" />
          </linearGradient>
          <path id={`${id}-arc`} d="M 22 52 A 28 28 0 0 1 78 52" />
        </defs>
        {/* Thickness: the puck's side shows below its face */}
        <circle cx="50" cy="54" r="45" fill={`url(#${id}-edge)`} />
        <circle cx="50" cy="50" r="45" fill={`url(#${id}-face)`} />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#12181b" strokeWidth="2.2" />
        <text className="dealer-button-rim">
          <textPath href={`#${id}-arc`} startOffset="50%" textAnchor="middle">
            DEALER
          </textPath>
        </text>
        <text className="dealer-button-d" x="50" y="70" textAnchor="middle">
          D
        </text>
      </svg>
    </span>
  );
}
