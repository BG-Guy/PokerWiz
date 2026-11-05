// The 13x13 range grid of a spot: one cell per starting hand (pairs on the diagonal, suited above, offsuit below),
// each split into a colour bar by how often the hand takes each action. A highlighted action colours only where it
// is played; hands you would never hold in the spot are hollow. Tap or click a cell to pick it, hover (mouse) or
// arrow around (keyboard) to preview it.
import { memo, useMemo, useRef, useState } from 'react';
import { neighborOf } from '../../gto/preflop/scenarioGrid.js';
import { handBackground, percent } from './actionStyle.js';
import './StrategyGrid.css';

const MOVES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// A cell: its hand name on a colour bar. Memoised so picking a hand only repaints the cells whose look changed.
const Cell = memo(function Cell({ cell, background, label, selected, dim, tab }) {
  const state = !cell.inRange ? 'is-out' : dim === 'plain' ? 'is-dim' : dim === 'part' ? 'is-part' : '';
  return (
    <button
      type="button"
      className={`rg-cell ${state} ${selected ? 'is-selected' : ''}`}
      style={{ background, '--d': Math.floor(cell.cls / 13) + (cell.cls % 13) }}
      data-cls={cell.cls}
      tabIndex={tab ? 0 : -1}
      aria-label={label}
      aria-pressed={selected}
    >
      {cell.name}
    </button>
  );
});

// grid: from buildGrid. highlight: an action index (or null). selected: the picked class (or null).
// fill: stretch to the box it sits in (full screen) instead of staying square.
export default function StrategyGrid({ grid, highlight = null, selected = null, onSelect, onPreview, fill = false, busy = false, label = 'Preflop range', className = '' }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(null);
  const tabbable = focused ?? selected ?? 0;

  // How each cell looks and what a screen reader says about it; only changes with the spot and the highlight.
  const cells = useMemo(
    () =>
      grid.cells.map((cell) => {
        // With an action highlighted: a hand that never plays it is plain, one that plays it a little has a sliver of colour.
        const played = highlight === null || !cell.inRange ? 1 : cell.freq[highlight];
        const dim = played < 0.005 ? 'plain' : played < 0.5 ? 'part' : null;
        const parts = grid.order.filter((a) => cell.freq[a] >= 0.005).map((a) => `${grid.actions[a].short} ${percent(cell.freq[a])}`);
        return {
          cell,
          dim,
          background: !cell.inRange ? 'transparent' : dim === 'plain' ? 'var(--rg-dim)' : handBackground(cell.freq, grid, highlight),
          label: cell.inRange ? `${cell.name}: ${parts.join(', ')}` : `${cell.name}: not in this range`,
        };
      }),
    [grid, highlight]
  );

  const clsOf = (event) => {
    const el = event.target.closest?.('.rg-cell');
    return el ? Number(el.dataset.cls) : null;
  };

  const onKeyDown = (event) => {
    const cls = clsOf(event);
    if (cls === null) return;
    const row = Math.floor(cls / 13);
    let next = null;
    if (MOVES[event.key]) next = neighborOf(cls, ...MOVES[event.key]);
    else if (event.key === 'Home') next = row * 13;
    else if (event.key === 'End') next = row * 13 + 12;
    if (next === null) return;
    event.preventDefault();
    ref.current.children[next].focus();
  };

  return (
    <div
      ref={ref}
      className={`rg-grid ${fill ? 'is-fill' : ''} ${className}`}
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      onClick={(event) => {
        const cls = clsOf(event);
        if (cls !== null) onSelect?.(cls);
      }}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const cls = clsOf(event);
        if (cls === null) return;
        setFocused(cls);
        onPreview?.(cls);
      }}
      onBlur={(event) => {
        if (!ref.current.contains(event.relatedTarget)) onPreview?.(null);
      }}
      onPointerOver={(event) => {
        const cls = event.pointerType === 'mouse' ? clsOf(event) : null;
        if (cls !== null) onPreview?.(cls);
      }}
      onPointerLeave={(event) => event.pointerType === 'mouse' && onPreview?.(null)}
    >
      {cells.map(({ cell, background, label: text, dim }) => (
        <Cell key={cell.cls} cell={cell} background={background} label={text} dim={dim} selected={selected === cell.cls} tab={tabbable === cell.cls} />
      ))}
    </div>
  );
}
