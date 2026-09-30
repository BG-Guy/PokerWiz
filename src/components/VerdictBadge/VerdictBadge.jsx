// Colored label showing a hand's review verdict (Good play, Mistake, Cooler, To review).
import { VERDICTS } from '../../constants/poker.js';
import './VerdictBadge.css';

export default function VerdictBadge({ verdict }) {
  return <span className={`verdict-badge is-${verdict}`}>{VERDICTS[verdict]}</span>;
}
