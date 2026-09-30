// Signed money amount, colored green for wins and red for losses.
import { formatMoney } from '../../utils/format.js';
import './Money.css';

export default function Money({ amount, className = '' }) {
  const tone = amount > 0 ? 'is-positive' : amount < 0 ? 'is-negative' : '';
  return <span className={`money num ${tone} ${className}`}>{formatMoney(amount)}</span>;
}
