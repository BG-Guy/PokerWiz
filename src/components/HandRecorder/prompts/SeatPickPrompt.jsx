// Steps 2 and 3: seat the hero, then mark the villains. Works by tapping the table or the position chips.
import Icon from '../../Icon/Icon.jsx';

export default function SeatPickPrompt({ mode, positions, heroSeat, villainSeats, onPick, onContinue }) {
  const isHero = mode === 'hero';

  return (
    <>
      <span className="prompt-kicker">
        <Icon name={isHero ? 'hero' : 'villain'} size={14} /> Seats
      </span>
      <h2 className="prompt-title">{isHero ? 'Where were you sitting?' : 'Who else was in the hand?'}</h2>
      <p className="prompt-text">
        {isHero
          ? 'Tap your seat on the table, or pick your position below.'
          : 'Tap each villain. Everyone else folded before the flop.'}
      </p>

      {/* Position chips mirror the table for quick, precise picks */}
      <div className="prompt-chips">
        {positions.map((position, seat) => {
          if (!isHero && seat === heroSeat) return null;
          const selected = isHero ? seat === heroSeat : villainSeats.includes(seat);
          return (
            <button
              key={position}
              type="button"
              className={`filter-chip ${selected ? 'is-active' : ''}`}
              aria-pressed={selected}
              onClick={() => onPick(seat)}
            >
              {position}
            </button>
          );
        })}
      </div>

      {!isHero && (
        <div className="prompt-actions">
          <button type="button" className="btn" disabled={villainSeats.length === 0} onClick={onContinue}>
            {villainSeats.length === 0 ? 'Pick at least one' : `Next with ${villainSeats.length}`} <Icon name="chevronRight" size={16} />
          </button>
        </div>
      )}
    </>
  );
}
