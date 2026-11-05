// Everything about one hand in the current spot: two example cards and its name, a one-sentence verdict ("Always
// 3-bet. Folding costs 1.2 bb."), a frequency bar and the cost against the best play for every action, the hands next
// to it on the grid, and a way into Practice. One component, three places: the phone sheet, the desktop side panel and
// a compact strip under the full-screen grid.
import { handFamily } from '../../coach/spots.js';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import { describeHand, handCards, handType, neighborOf } from '../../gto/preflop/scenarioGrid.js';
import { colorOf, handBackground, percent } from './actionStyle.js';
import PracticeLink from './PracticeLink.jsx';
import './HandDetail.css';

// The four hands around it on the grid, with the direction they sit in.
const AROUND = [
  { dx: 0, dy: -1, label: 'Above' },
  { dx: -1, dy: 0, label: 'Left' },
  { dx: 1, dy: 0, label: 'Right' },
  { dx: 0, dy: 1, label: 'Below' },
];

// variant: 'sheet' | 'panel' | 'strip'. onPick: jump to another hand (the neighbours). onMore: the strip's way to the full sheet.
export default function HandDetail({ grid, cls, variant = 'sheet', onPick, onMore }) {
  const cell = grid.cells[cls];
  const { scenario, actions } = grid;
  const verdict = describeHand(grid, cls);
  const out = verdict.tone === 'out';
  const [first, second] = handCards(cls);
  const family = handFamily(cell.name);

  if (variant === 'strip') {
    return (
      <div className={`rg-hand is-strip is-${verdict.tone}`}>
        <span className="rg-hand-strip-name num">{cell.name}</span>
        <span className="rg-hand-strip-text">
          <span className="rg-hand-strip-headline">{verdict.headline}</span>
          <span className="rg-hand-strip-bar" style={{ background: out ? 'transparent' : handBackground(cell.freq, grid) }} aria-hidden="true" />
        </span>
        <button type="button" className="rg-hand-more" onClick={onMore} aria-label={`More about ${cell.name}`}>
          Details
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`rg-hand is-${variant}`}>
      <header className="rg-hand-head">
        <span className="rg-hand-cards">
          <PlayingCard code={first} size="md" />
          <PlayingCard code={second} size="md" />
        </span>
        <span className="rg-hand-id">
          <span className="rg-hand-name num">{cell.name}</span>
          <span className="rg-hand-meta">
            {handType(cls)} · {cell.combos} combos
          </span>
          <span className="rg-hand-meta">{family}</span>
        </span>
      </header>

      <div className={`rg-hand-tldr is-${verdict.tone}`}>
        <p className="rg-hand-headline">{verdict.headline}</p>
        {verdict.detail && <p className="rg-hand-text">{verdict.detail}</p>}
        {cell.inRange && cell.reach < 0.99 && <p className="rg-hand-text">You only get here with {cell.name} {percent(cell.reach)} of the time.</p>}
      </div>

      {!out && (
        <ul className="rg-hand-rows" aria-label={`What ${cell.name} does here`}>
          {verdict.rows.map(({ action, freq, best, text }) => (
            <li key={action.index} className="rg-hand-row">
              <span className="rg-hand-row-top">
                <span className="rg-hand-dot" style={{ background: colorOf(action, actions) }} />
                <span className="rg-hand-row-label">{action.label}</span>
                <span className="rg-hand-row-freq num">{percent(freq)}</span>
              </span>
              <span className="rg-hand-row-track">
                <span className="rg-hand-row-fill" style={{ width: `${Math.max(freq * 100, freq > 0 ? 2 : 0)}%`, background: colorOf(action, actions) }} />
              </span>
              <span className={`rg-hand-row-loss ${best ? 'is-best' : ''}`}>{text}</span>
            </li>
          ))}
        </ul>
      )}

      {variant === 'sheet' && (
        <div className="rg-hand-near">
          <h3 className="rg-hand-near-title">Nearby hands</h3>
          <div className="rg-hand-near-list">
            {AROUND.map(({ dx, dy, label }) => {
              const next = neighborOf(cls, dx, dy);
              if (next === null) return null;
              const other = grid.cells[next];
              return (
                <button key={label} type="button" className="rg-hand-near-chip" onClick={() => onPick?.(next)} aria-label={`${other.name}, ${label.toLowerCase()} on the grid`}>
                  <span className="rg-hand-near-name num">{other.name}</span>
                  <span className="rg-hand-near-bar" style={{ background: other.inRange ? handBackground(other.freq, grid) : 'transparent' }} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rg-hand-practice">
        <PracticeLink scenario={scenario} compact={variant === 'panel'} />
      </div>
    </div>
  );
}
