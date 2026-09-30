// Setup for replaying a saved hand in Practice: from which street, whose cards the villains play (the real
// ones when the hand shows them, or cards from their range), how the next cards come, and the reads.
import { Link } from 'react-router-dom';
import { replayStreets } from '../../practice/replaySpot.js';
import { prepareSavedHand } from '../../coach/savedHand.js';
import { defaultProfile, describeProfile } from '../../coach/profiles.js';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import ReadPicker from '../../components/ReadPicker/ReadPicker.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './PracticeSetup.css';

const BOARD_SIZE = { Flop: 3, Turn: 4, River: 5 };

export default function ReplaySetup({ hand, options, onChange, onStart }) {
  const prepared = prepareSavedHand(hand);
  const villains = prepared.record?.players.filter((p) => p.role === 'villain') ?? [];
  const anyKnown = villains.some((v) => v.cards?.length === 2);
  const streets = replayStreets(hand);
  const board = (hand.board ?? []).slice(0, BOARD_SIZE[options.street]);
  const later = (hand.board ?? []).slice(BOARD_SIZE[options.street]);
  const profileOf = (position) => options.profiles[position] ?? villains.find((v) => v.position === position)?.profile ?? defaultProfile();

  return (
    <div className="practice-setup">
      <section className="practice-card">
        <h2 className="practice-card-title">
          <Icon name="undo" size={18} /> Replay: {hand.title}
        </h2>
        <p className="practice-card-text">
          Everything up to the {options.street.toLowerCase()} stays as it was. From there it's your call: play it differently and see how
          they react.
        </p>
        <div className="replay-setup-cards">
          <span className="replay-setup-hand">
            {(hand.holeCards ?? []).map((code) => (
              <PlayingCard key={code} code={code} size="sm" />
            ))}
          </span>
          <span className="replay-setup-board">
            {board.map((code) => (
              <PlayingCard key={code} code={code} size="sm" />
            ))}
          </span>
        </div>

        <div className="read-picker-group">
          <span className="read-picker-label">Replay from</span>
          <FilterChips label="Replay from" value={options.street} onChange={(street) => onChange({ ...options, street })} options={streets.map((s) => ({ value: s, label: s }))} />
        </div>

        <div className="read-picker-group">
          <span className="read-picker-label">Villain cards</span>
          <FilterChips
            label="Villain cards"
            value={anyKnown ? options.villainCards : 'range'}
            onChange={(villainCards) => onChange({ ...options, villainCards })}
            options={anyKnown ? [{ value: 'real', label: 'Their real cards' }, { value: 'range', label: 'From their range' }] : [{ value: 'range', label: 'From their range' }]}
          />
          <p className="read-picker-description">
            {anyKnown && options.villainCards === 'real'
              ? 'Villains play the cards they really had (shown in this hand). Where a hand is unknown, they get cards that fit how they played.'
              : 'Their cards weren’t shown, so each villain is dealt a hand that fits everything they did up to here. Replay again for a different one.'}
          </p>
        </div>

        <div className="read-picker-group">
          <span className="read-picker-label">Next cards</span>
          <FilterChips
            label="Next cards"
            value={options.boardMode}
            onChange={(boardMode) => onChange({ ...options, boardMode })}
            options={[
              ...(later.length ? [{ value: 'real', label: 'As they came' }] : []),
              { value: 'random', label: 'Random' },
              { value: 'pick', label: 'I pick them' },
            ]}
          />
          {options.boardMode === 'real' && later.length > 0 && (
            <p className="read-picker-description replay-setup-later">
              Then:{' '}
              {later.map((code) => (
                <PlayingCard key={code} code={code} size="xs" />
              ))}
            </p>
          )}
        </div>
      </section>

      {villains.map((villain) => (
        <section key={villain.seat} className="practice-card">
          <h2 className="practice-card-title">
            <Icon name="villain" size={18} /> {villain.position}
            <span className="practice-card-badge">{describeProfile(profileOf(villain.position)).label}</span>
          </h2>
          <ReadPicker
            compact
            profile={profileOf(villain.position)}
            onChange={(profile) => onChange({ ...options, profiles: { ...options.profiles, [villain.position]: profile } })}
          />
        </section>
      ))}

      <button type="button" className="btn practice-start" onClick={onStart}>
        <Icon name="play" size={18} /> Play from the {options.street.toLowerCase()}
      </button>
      <Link to={`/hands/${hand.id}`} className="btn btn-ghost">
        <Icon name="chevronLeft" size={16} /> Back to the hand
      </Link>
    </div>
  );
}
