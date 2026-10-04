// Step 1: stakes and table size.
import { useState } from 'react';
import { STAKES } from '../../../constants/poker.js';
import FilterChips from '../../FilterChips/FilterChips.jsx';
import Icon from '../../Icon/Icon.jsx';

const STAKE_OPTIONS = STAKES.map((s) => ({ value: s.label, label: s.label }));
const SIZE_OPTIONS = [
  { value: 9, label: '9-max' },
  { value: 8, label: '8-max' },
  { value: 6, label: '6-max' },
];

export default function GamePrompt({ stakesLabel, tableSize, onContinue }) {
  const [stakes, setStakes] = useState(stakesLabel);
  const [size, setSize] = useState(tableSize);

  return (
    <>
      <span className="prompt-kicker">Setup</span>
      <h2 className="prompt-title">What game was it?</h2>
      <p className="prompt-text">No-Limit Hold'em cash game.</p>

      <span className="prompt-field-label">Stakes</span>
      <FilterChips options={STAKE_OPTIONS} value={stakes} onChange={setStakes} label="Stakes" />

      <span className="prompt-field-label">Table</span>
      <FilterChips options={SIZE_OPTIONS} value={size} onChange={setSize} label="Table size" />

      <div className="prompt-actions">
        <button type="button" className="btn" onClick={() => onContinue(stakes, size)}>
          Next <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </>
  );
}
