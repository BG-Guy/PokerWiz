// Stacks step: how deep each player was when the hand started. Quick picks set everyone at once; each
// player also has depth labels (Short 40 bb, Average 100, Big 150, Huge 250) and an exact amount.
// Stacks cap bets and decide who can go all in (and for how much).
import Icon from '../../Icon/Icon.jsx';

const DEPTHS = [50, 100, 200]; // quick picks for everyone, in big blinds

// Per-player depth labels, in big blinds.
const DEPTH_LABELS = [
  { label: 'Short', bb: 40 },
  { label: 'Average', bb: 100 },
  { label: 'Big', bb: 150 },
  { label: 'Huge', bb: 250 },
];

export default function StacksPrompt({ players, stacks, bb, onChange, onSetAll, onContinue }) {
  const allValid = players.every((p) => Number(stacks[p.seat]) > 0);

  return (
    <>
      <span className="prompt-kicker">
        <Icon name="coins" size={14} /> Stacks
      </span>
      <h2 className="prompt-title">How deep was everyone?</h2>
      <p className="prompt-text">Stack sizes at the start of the hand.</p>

      <div className="prompt-chips">
        {DEPTHS.map((depth) => (
          <button key={depth} type="button" className="filter-chip" onClick={() => onSetAll(depth * bb)}>
            Everyone {depth} bb
          </button>
        ))}
      </div>

      <ul className="prompt-player-list">
        {players.map((player) => {
          const value = stacks[player.seat] ?? '';
          const depth = Number(value) > 0 ? Math.round(Number(value) / bb) : null;
          return (
            <li key={player.seat} className="prompt-player-row stack-row">
              <span className="prompt-player-main">
                <span className={`prompt-player-avatar is-${player.role}`}>
                  <Icon name={player.role} size={18} />
                </span>
                <span className="prompt-player-name">
                  {player.name}
                  <span className="prompt-player-meta">{depth ? `${player.position} · ${depth} bb` : player.position}</span>
                </span>
              </span>
              <label className="prompt-stack-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={value}
                  aria-label={`${player.name} stack in dollars`}
                  onChange={(event) => onChange(player.seat, event.target.value)}
                />
              </label>

              {/* Quick depth picks for this player */}
              <span className="stack-row-depths">
                {DEPTH_LABELS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    className={`filter-chip ${depth === d.bb ? 'is-active' : ''}`}
                    onClick={() => onChange(player.seat, String(d.bb * bb))}
                  >
                    {d.label}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="prompt-actions">
        <button type="button" className="btn" disabled={!allValid} onClick={onContinue}>
          Next <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </>
  );
}
