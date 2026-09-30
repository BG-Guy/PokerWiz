// Steps 4 and 5: the hero's hole cards (required), then villains' cards (only if they were shown).
import { useEffect, useState } from 'react';
import CardSlot from '../../CardSlot/CardSlot.jsx';
import CardPicker from '../../CardPicker/CardPicker.jsx';
import Icon from '../../Icon/Icon.jsx';

export default function CardsPrompt({ mode, players, used, onHeroCards, onSetCards, onContinue }) {
  const [pickerSeat, setPickerSeat] = useState(null);
  const hero = players.find((p) => p.role === 'hero');
  const villains = players.filter((p) => p.role === 'villain');
  const pickerPlayer = players.find((p) => p.seat === pickerSeat);

  // Hero step: open the deck automatically once the card has slid in.
  useEffect(() => {
    if (mode !== 'hero') return undefined;
    const timer = setTimeout(() => setPickerSeat(hero.seat), 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = (codes) => {
    const seat = pickerSeat;
    setPickerSeat(null);
    if (mode === 'hero') {
      if (codes.length === 2) onHeroCards(codes);
    } else {
      onSetCards(seat, codes.length === 2 ? codes : []); // one card isn't useful; treat as unknown
    }
  };

  return (
    <>
      <span className="prompt-kicker">
        <Icon name="cards" size={14} /> Cards
      </span>

      {mode === 'hero' ? (
        <>
          <h2 className="prompt-title">What was your hand?</h2>
          <p className="prompt-text">Pick your two hole cards.</p>
          <div className="prompt-slots">
            {[0, 1].map((i) => (
              <CardSlot key={i} code={hero.cards[i]} size="lg" label={`Your card ${i + 1}`} onClick={() => setPickerSeat(hero.seat)} />
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 className="prompt-title">Did you see their cards?</h2>
          <p className="prompt-text">Only if they were shown. Otherwise leave them unknown.</p>
          <ul className="prompt-player-list">
            {villains.map((villain) => (
              <li key={villain.seat} className="prompt-player-row">
                <span className="prompt-player-main">
                  <span className="prompt-player-avatar is-villain">
                    <Icon name="villain" size={18} />
                  </span>
                  <span className="prompt-player-name">
                    {villain.name}
                    <span className="prompt-player-meta">{villain.cards.length ? villain.position : `${villain.position} · unknown`}</span>
                  </span>
                </span>
                <span className="prompt-player-cards">
                  {[0, 1].map((i) => (
                    <CardSlot
                      key={i}
                      code={villain.cards[i]}
                      size="sm"
                      label={`${villain.name} card ${i + 1}`}
                      onClick={() => setPickerSeat(villain.seat)}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="prompt-actions">
            <button type="button" className="btn" onClick={onContinue}>
              Start the action <Icon name="play" size={14} />
            </button>
          </div>
        </>
      )}

      <CardPicker
        open={pickerSeat !== null}
        title={pickerPlayer?.role === 'hero' ? 'Your hand' : `${pickerPlayer?.name ?? ''} cards`}
        count={2}
        initial={pickerPlayer?.cards ?? []}
        used={used}
        allowPartial={mode === 'villains'}
        onDone={handleDone}
        onClose={() => setPickerSeat(null)}
      />
    </>
  );
}
