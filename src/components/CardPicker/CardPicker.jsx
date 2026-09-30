// Deck picker in a modal. Pick up to `count` cards; it closes by itself once enough are picked.
// Cards already used elsewhere (other players, the board) are disabled.
// Layout: rank rows x suit columns on phones (big tap targets), suit rows x rank columns on wider screens.
import { useEffect, useState } from 'react';
import Modal from '../Modal/Modal.jsx';
import SuitIcon from '../PlayingCard/SuitIcon.jsx';
import PlayingCard from '../PlayingCard/PlayingCard.jsx';
import { RANKS_DESC, SUITS, isRedSuit } from '../../utils/cards.js';
import './CardPicker.css';

const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

export default function CardPicker({ open, title, count, initial = [], used = [], allowPartial = false, onDone, onClose }) {
  const [picked, setPicked] = useState(initial);

  // Start from the slot's current cards each time the picker opens.
  useEffect(() => {
    if (open) setPicked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The slot's own cards can be re-picked; everything else in `used` is off limits.
  const blocked = new Set(used.filter((code) => !initial.includes(code)));

  const toggle = (code) => {
    if (picked.includes(code)) {
      setPicked(picked.filter((c) => c !== code));
      return;
    }
    const next = [...picked, code];
    if (next.length >= count) onDone(next.slice(0, count));
    else setPicked(next);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} className="card-picker-modal">
      {/* Picked so far */}
      <div className="card-picker-selected">
        <div className="card-picker-selected-cards">
          {Array.from({ length: count }, (_, i) => (
            <PlayingCard key={i} code={picked[i]} size="sm" />
          ))}
        </div>
        <span className="card-picker-count">
          {picked.length} of {count}
        </span>
      </div>

      {/* The deck: each cell is placed by CSS using its rank and suit index */}
      <div className="card-picker-grid" role="group" aria-label="Deck">
        {RANKS_DESC.map((rank, rankIndex) =>
          [...SUITS].map((suit, suitIndex) => {
            const code = rank + suit;
            const isPicked = picked.includes(code);
            return (
              <button
                key={code}
                type="button"
                className={`card-picker-cell ${isRedSuit(suit) ? 'is-red' : ''} ${isPicked ? 'is-picked' : ''}`}
                style={{ '--rank': rankIndex, '--suit': suitIndex }}
                disabled={blocked.has(code)}
                aria-pressed={isPicked}
                aria-label={`${rank === 'T' ? '10' : rank} of ${SUIT_NAMES[suit]}`}
                onClick={() => toggle(code)}
              >
                <span className="card-picker-rank">{rank === 'T' ? '10' : rank}</span>
                <SuitIcon suit={suit} className="card-picker-suit" />
              </button>
            );
          })
        )}
      </div>

      <div className="card-picker-actions">
        {picked.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setPicked([])}>
            Clear
          </button>
        )}
        {allowPartial && (
          <button type="button" className="btn" onClick={() => onDone(picked)}>
            {picked.length === 0 ? 'Leave unknown' : 'Done'}
          </button>
        )}
      </div>
    </Modal>
  );
}
