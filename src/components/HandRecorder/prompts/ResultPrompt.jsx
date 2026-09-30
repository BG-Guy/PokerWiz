// Showdown step: pick who won (several = split pot). Villains' cards can be revealed here;
// when every hand is known, the best one is pre-selected and marked.
import { useState } from 'react';
import { describeHand } from '../../../utils/handEvaluator.js';
import PlayingCard from '../../PlayingCard/PlayingCard.jsx';
import CardSlot from '../../CardSlot/CardSlot.jsx';
import CardPicker from '../../CardPicker/CardPicker.jsx';
import Icon from '../../Icon/Icon.jsx';

export default function ResultPrompt({ players, board, winners, suggested, used, onToggleWinner, onReveal, onContinue }) {
  const [pickerSeat, setPickerSeat] = useState(null);
  const pickerPlayer = players.find((p) => p.seat === pickerSeat);

  return (
    <>
      <span className="prompt-kicker">
        <Icon name="flag" size={14} /> Showdown
      </span>
      <h2 className="prompt-title">Who won the pot?</h2>
      <p className="prompt-text">Tap the winner. Pick more than one for a split pot.</p>

      <ul className="prompt-player-list">
        {players.map((player) => {
          const selected = winners.includes(player.seat);
          const madeHand = player.cards.length === 2 ? describeHand([...player.cards, ...board]) : null;
          return (
            <li key={player.seat} className={`prompt-player-row ${selected ? 'is-selected' : ''}`}>
              <button type="button" className="prompt-player-main" aria-pressed={selected} onClick={() => onToggleWinner(player.seat)}>
                <span className={`prompt-player-avatar is-${player.role}`}>
                  <Icon name={selected ? 'check' : player.role} size={18} />
                </span>
                <span className="prompt-player-name">
                  {player.name}
                  <span className="prompt-player-meta">{madeHand ?? `${player.position} · cards unknown`}</span>
                </span>
                {suggested?.includes(player.seat) && <span className="prompt-badge">Best hand</span>}
              </button>

              {/* Hero's cards are known; villains can be revealed here */}
              <span className="prompt-player-cards">
                {player.role === 'hero'
                  ? player.cards.map((code) => <PlayingCard key={code} code={code} size="sm" />)
                  : [0, 1].map((i) => (
                      <CardSlot
                        key={i}
                        code={player.cards[i]}
                        size="sm"
                        label={`${player.name} card ${i + 1}`}
                        onClick={() => setPickerSeat(player.seat)}
                      />
                    ))}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="prompt-actions">
        <button type="button" className="btn" disabled={winners.length === 0} onClick={onContinue}>
          {winners.length > 1 ? 'Split pot' : 'Next'} <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <CardPicker
        open={pickerSeat !== null}
        title={`${pickerPlayer?.name ?? ''} showed`}
        count={2}
        initial={pickerPlayer?.cards ?? []}
        used={used}
        allowPartial
        onDone={(codes) => {
          onReveal(pickerSeat, codes.length === 2 ? codes : []);
          setPickerSeat(null);
        }}
        onClose={() => setPickerSeat(null)}
      />
    </>
  );
}
