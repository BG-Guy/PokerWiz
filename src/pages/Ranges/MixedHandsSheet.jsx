// The sheet that lists the hands GTO mixes in the current spot (they take two or more plays), each with its split
// and its colour bar. Tap one to see it. Opens from the "mixed hands" count under the grid.
import { useMemo } from 'react';
import Modal from '../../components/Modal/Modal.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import { handBackground, percent } from './actionStyle.js';
import './MixedHandsSheet.css';

export default function MixedHandsSheet({ open, onClose, grid, onPick }) {
  const mixed = useMemo(() => grid.cells.filter((cell) => cell.mixed), [grid]);
  return (
    <Modal open={open} onClose={onClose} title={`Mixed hands · ${grid.scenario.title}`} className="rg-mixed">
      {mixed.length === 0 ? (
        <p className="rg-mixed-lead">No hand mixes here: every hand has one clear play. Tap the grid to see them.</p>
      ) : (
        <>
          <p className="rg-mixed-lead">
            {mixed.length} {mixed.length === 1 ? 'hand takes' : 'hands take'} two or more plays. When a hand mixes, the plays are about equally good, so either is fine. Tap one to see it.
          </p>
          <ul className="rg-mixed-list stagger-in">
            {mixed.map((cell) => (
              <li key={cell.cls}>
                <button type="button" className="rg-mixed-row" onClick={() => onPick(cell.cls)}>
                  <span className="rg-mixed-name num">{cell.name}</span>
                  <span className="rg-mixed-main">
                    <span className="rg-mixed-text">
                      {grid.order
                        .filter((a) => cell.freq[a] >= 0.05)
                        .map((a) => `${grid.actions[a].short} ${percent(cell.freq[a])}`)
                        .join(' · ')}
                    </span>
                    <span className="rg-mixed-bar" style={{ background: handBackground(cell.freq, grid) }} aria-hidden="true" />
                  </span>
                  <Icon name="chevronRight" size={18} className="rg-mixed-chevron" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
