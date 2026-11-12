// Why totals are in dollars while the BB/$ switch is on big blinds: the sessions (or hands) behind them were
// played at different blinds, and big blinds of different sizes don't add up. Renders nothing when the switch
// isn't overruled. scope: moneyScope() or handScope() from utils/format.js.
import { mixedStakesNote } from '../../utils/format.js';
import './UnitNote.css';

// tip: what to do about it on this screen ("Pick one stake to see big blinds."), instead of the explanation.
export default function UnitNote({ scope, tip = null, className = '' }) {
  const text = mixedStakesNote(scope, tip);
  if (!text) return null;
  return (
    <p className={`unit-note ${className}`}>
      <span className="unit-note-mark" aria-hidden="true">
        $
      </span>
      {text}
    </p>
  );
}
