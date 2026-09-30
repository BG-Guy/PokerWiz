// Signed money amount, colored green for wins and red for losses. bb: the big blind it's measured against
// (shown in big blinds or dollars, per the BB/$ switch).
import { formatMoney } from '../../utils/format.js';
import './Money.css';

export default function Money({ amount, bb = null, className = '' }) {
  const tone = amount > 0 ? 'is-positive' : amount < 0 ? 'is-negative' : '';
  return <span className={`money num ${tone} ${className}`}>{formatMoney(amount, { bb })}</span>;
}
