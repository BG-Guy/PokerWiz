// Practice setup: the game (cash or tournament), the spot (preflop, heads-up, 3-way), which pots (any, or
// 3-bet pots only), how the next cards come (random or picked by you), and the stacks. Opponents all play
// GTO; player reads (tendencies per opponent) come back here once the engine uses them (gto/config.js).
import { GAMES, FORMATS, POTS } from '../../practice/generateSpot.js';
import { defaultProfile, describeProfile } from '../../coach/profiles.js';
import { PLAYER_READS } from '../../gto/config.js';
import ReadPicker from '../../components/ReadPicker/ReadPicker.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './PracticeSetup.css';

const STACK_CHOICES = {
  cash: [40, 60, 100, 150, 200],
  mtt: [10, 15, 20, 30, 50, 80],
};

function StackPicker({ game, value, onChange, label }) {
  return (
    <div className="practice-stack">
      <span className="read-picker-label">{label}</span>
      <div className="practice-stack-row">
        {STACK_CHOICES[game].map((bb) => (
          <button key={bb} type="button" className={`filter-chip ${value === bb ? 'is-active' : ''}`} aria-pressed={value === bb} onClick={() => onChange(bb)}>
            {bb} bb
          </button>
        ))}
        <label className="practice-stack-input">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={value}
            aria-label={`${label} in big blinds`}
            onChange={(event) => onChange(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))}
          />
          <span>bb</span>
        </label>
      </div>
    </div>
  );
}

export default function PracticeSetup({ setup, onChange, onStart }) {
  const format = FORMATS.find((f) => f.id === setup.format);
  const game = GAMES.find((g) => g.id === setup.game);
  const opponents = setup.villains[0];

  const changeGame = (id) => {
    const next = GAMES.find((g) => g.id === id);
    onChange({
      ...setup,
      game: id,
      hero: { ...setup.hero, stackBB: next.defaultStackBB },
      villains: setup.villains.map((v) => ({ ...v, stackBB: next.defaultStackBB })),
    });
  };
  const changeOpponents = (patch) => onChange({ ...setup, villains: setup.villains.map((v, i) => (i === 0 ? { ...v, ...patch } : v)) });

  return (
    <div className="practice-setup">
      <section className="practice-card">
        <h2 className="practice-card-title">The game</h2>
        <FilterChips label="Game" value={setup.game} onChange={changeGame} options={GAMES.map((g) => ({ value: g.id, label: g.label }))} />
        <FilterChips
          label="Spot"
          value={setup.format}
          onChange={(id) => onChange({ ...setup, format: id })}
          options={FORMATS.map((f) => ({ value: f.id, label: f.label }))}
        />
        <p className="practice-card-text">
          {format.description} {game.id === 'mtt' ? 'Blinds 1/2 with a big-blind ante, 8-handed.' : 'Blinds $1/$2, 8-handed.'}
        </p>
        <div className="read-picker-group">
          <span className="read-picker-label">Pots</span>
          <FilterChips label="Pots" value={setup.pot} onChange={(pot) => onChange({ ...setup, pot })} options={POTS.map((p) => ({ value: p.id, label: p.label }))} />
          <p className="read-picker-description">
            {setup.pot !== '3bet'
              ? 'Pots come as often as they would at a table of GTO players: mostly single-raised, some 3-bet and 4-bet.'
              : format.id === 'preflop'
                ? 'Only hands with a 3-bet: you make it, or you face it after opening or calling.'
                : 'Only pots that were 3-bet before the flop: as the 3-bettor or the caller.'}
          </p>
        </div>
        <div className="read-picker-group">
          <span className="read-picker-label">Next cards</span>
          <FilterChips
            label="Next cards"
            value={setup.boardMode}
            onChange={(boardMode) => onChange({ ...setup, boardMode })}
            options={[
              { value: 'random', label: 'Random' },
              { value: 'pick', label: 'I pick them' },
            ]}
          />
          <p className="read-picker-description">
            {setup.boardMode === 'pick'
              ? "You choose each street's cards, to practice the runouts you want."
              : 'The flop, turn and river are dealt at random as the hand plays out.'}
          </p>
        </div>
      </section>

      <section className="practice-card">
        <h2 className="practice-card-title">
          <Icon name="users" size={18} /> Your opponents
          <span className="practice-card-badge">{PLAYER_READS ? describeProfile(opponents.profile ?? defaultProfile()).label : 'GTO'}</span>
        </h2>
        <p className="practice-card-text">
          Every opponent plays game-theory-optimal poker with their real cards: solved preflop charts for this stack depth, and each postflop street
          solved as the hand goes.
        </p>
        {PLAYER_READS && <ReadPicker profile={opponents.profile ?? defaultProfile()} onChange={(profile) => changeOpponents({ profile })} />}
        <StackPicker game={setup.game} label="Their stacks" value={opponents.stackBB} onChange={(stackBB) => changeOpponents({ stackBB })} />
      </section>

      <section className="practice-card">
        <h2 className="practice-card-title">
          <Icon name="hero" size={18} /> You
        </h2>
        <StackPicker game={setup.game} label="Your stack" value={setup.hero.stackBB} onChange={(stackBB) => onChange({ ...setup, hero: { ...setup.hero, stackBB } })} />
        <p className="read-picker-description">Everyone is graded the same way: against GTO, by how much each decision gives up.</p>
      </section>

      <button type="button" className="btn practice-start" onClick={onStart}>
        <Icon name="play" size={18} /> Deal a hand
      </button>
    </div>
  );
}
