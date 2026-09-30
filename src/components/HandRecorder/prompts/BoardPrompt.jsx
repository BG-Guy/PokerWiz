// Board step: pick the flop (3 cards), turn or river (1 card). The deck opens by itself.
import { useEffect, useState } from 'react';
import CardSlot from '../../CardSlot/CardSlot.jsx';
import CardPicker from '../../CardPicker/CardPicker.jsx';
import Icon from '../../Icon/Icon.jsx';

export default function BoardPrompt({ street, count, used, onDeal }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Open the deck once the card has slid into place.
  useEffect(() => {
    const timer = setTimeout(() => setPickerOpen(true), 450);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <span className="prompt-kicker">
        <Icon name="cards" size={14} /> {street}
      </span>
      <h2 className="prompt-title">{street === 'Flop' ? 'Deal the flop' : `What came on the ${street.toLowerCase()}?`}</h2>
      <p className="prompt-text">{count === 1 ? 'Pick one card.' : 'Pick three cards.'}</p>

      <div className="prompt-slots">
        {Array.from({ length: count }, (_, i) => (
          <CardSlot key={i} size="lg" label={`${street} card ${i + 1}`} onClick={() => setPickerOpen(true)} />
        ))}
      </div>

      <CardPicker
        open={pickerOpen}
        title={street}
        count={count}
        used={used}
        onDone={(codes) => {
          setPickerOpen(false);
          onDeal(codes);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
