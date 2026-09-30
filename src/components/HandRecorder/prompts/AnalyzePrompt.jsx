// Coach-mode final step: the hand is recorded; send it to the coach.
import { formatMoney } from '../../../utils/format.js';
import Money from '../../Money/Money.jsx';
import Icon from '../../Icon/Icon.jsx';

export default function AnalyzePrompt({ result, pot, decisions, onAnalyze }) {
  return (
    <>
      <span className="prompt-kicker">
        <Icon name="check" size={14} /> Hand recorded
      </span>
      <h2 className="prompt-title">
        Your result <Money amount={result} />
      </h2>
      <p className="prompt-text">
        Final pot {formatMoney(pot, { sign: false })}. The coach will review your {decisions} {decisions === 1 ? 'decision' : 'decisions'}{' '}
        against the ranges your reads imply.
      </p>
      <div className="prompt-actions">
        <button type="button" className="btn" onClick={onAnalyze}>
          <Icon name="bulb" size={16} /> Analyze this hand
        </button>
      </div>
    </>
  );
}
