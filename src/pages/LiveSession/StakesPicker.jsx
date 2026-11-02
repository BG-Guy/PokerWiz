// Stakes buttons for starting a session: the common stakes, the custom ones you've played (newest first), and a
// Custom button that opens the custom stakes sheet.
import { STAKES } from '../../constants/poker.js';
import { sameStake, stakeDetails } from '../../utils/stakes.js';
import Icon from '../../components/Icon/Icon.jsx';
import './StakesPicker.css';

// value: the picked stake. saved: your custom stakes. onChange(stake), onCustom() opens the sheet.
export default function StakesPicker({ value, saved, onChange, onCustom }) {
  const presets = STAKES.map((s) => ({ label: s.label, sb: s.sb, bb: s.bb }));
  // A custom stake that isn't saved (yet) still shows, first among the custom ones.
  const custom = value?.custom && !saved.some((s) => sameStake(s, value)) ? [value, ...saved] : saved;

  return (
    <div className="stakes-picker" role="group" aria-label="Stakes">
      {presets.map((stake) => {
        const active = !value?.custom && value?.label === stake.label;
        return (
          <button key={stake.label} type="button" className={`filter-chip ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => onChange(stake)}>
            {stake.label}
          </button>
        );
      })}

      {/* Your custom stakes: the label, with the table details small underneath */}
      {custom.map((stake) => {
        const active = Boolean(value?.custom) && sameStake(stake, value);
        const details = stakeDetails(stake);
        return (
          <button
            key={`${stake.label}-${stake.tableName}-${stake.tableSize}-${stake.ante}-${stake.game}`}
            type="button"
            className={`filter-chip stakes-picker-custom ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange({ ...stake, custom: true })}
          >
            <span className="stakes-picker-label">{stake.label}</span>
            {details && <span className="stakes-picker-details">{details}</span>}
          </button>
        );
      })}

      <button type="button" className="filter-chip stakes-picker-add" onClick={onCustom}>
        <Icon name="plus" size={16} /> Custom
      </button>
    </div>
  );
}
