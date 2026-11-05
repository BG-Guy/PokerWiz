// "Who called?": the same line of play with different callers (BB vs CO open, then with the button calling, with
// the small blind calling ...) as a row of chips under the depth. A long list shows the first few and an "All"
// chip that opens the rest in a sheet.
import { useState } from 'react';
import Modal from '../../components/Modal/Modal.jsx';
import DrillRow from '../../components/DrillRow/DrillRow.jsx';
import { percent } from './actionStyle.js';
import './VariantChips.css';

const SHOWN = 4;

// "Heads-up", "SB calls", "BTN + SB call".
export const variantLabel = (s) => (s.callers.length ? `${s.callers.join(' + ')} ${s.callers.length > 1 ? 'call' : 'calls'}` : 'Heads-up');

// variants: the spots of one line of play (variantsOf), base first. current: the one on show.
export default function VariantChips({ variants, current, onSelect }) {
  const [open, setOpen] = useState(false);
  if (variants.length < 2) return null;
  let shown = variants.slice(0, SHOWN);
  if (variants.length > SHOWN && !shown.includes(current)) shown = [...shown.slice(0, SHOWN - 1), current];
  const maxWeight = Math.max(...variants.map((s) => s.weight));

  return (
    <div className="rg-variants" role="group" aria-label="Who called">
      <span className="rg-variants-label">Callers</span>
      <div className="rg-variants-chips">
        {shown.map((s) => (
          <button key={s.id} type="button" className={`rg-variant ${s.id === current.id ? 'is-active' : ''}`} aria-pressed={s.id === current.id} onClick={() => onSelect(s)}>
            {variantLabel(s)}
          </button>
        ))}
        {variants.length > SHOWN && (
          <button type="button" className="rg-variant is-more" onClick={() => setOpen(true)} aria-haspopup="dialog">
            All {variants.length}
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`${current.title.split(' + ')[0]}: who called?`}>
        <div className="rg-variants-list stagger-in">
          {variants.map((s) => (
            <DrillRow
              key={s.id}
              title={variantLabel(s)}
              subtitle={s.subtitle}
              value={percent(s.headline.share)}
              hint={s.headline.label}
              meter={Math.max(0.04, Math.min(1, s.weight / maxWeight))}
              selected={s.id === current.id}
              onClick={() => {
                onSelect(s);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </Modal>
    </div>
  );
}
