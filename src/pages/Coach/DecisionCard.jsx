// One graded decision in the coach report: what you did vs. the best play, the numbers behind it
// (price, equity, fold equity, EV of every option), the coach's notes, and each villain's range read.
import { formatMoney } from '../../utils/format.js';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import RangeGrid from './RangeGrid.jsx';
import './DecisionCard.css';

const pct = (x) => `${Math.round(x * 100)}%`;
const dollars = (n) => formatMoney(Math.round(n * 100) / 100, { sign: false });
const signed = (n) => formatMoney(Math.round(n * 100) / 100);

const CHART_WORDS = { raise: 'Raise', call: 'Call', fold: 'Fold', check: 'Check' };

// Preflop chart: where the hand sits among all starting hands, next to the raise / play zones.
// A square-root scale gives the small premium ranges (top 3-10%) enough room to read.
function ChartScale({ thresholds, handTop }) {
  const at = (x) => `${Math.sqrt(Math.min(1, Math.max(0, x))) * 100}%`;
  const raiseEnd = thresholds.raise;
  const playEnd = Math.max(thresholds.play, thresholds.raise);
  return (
    <div className="decision-chart">
      <div className="decision-chart-bar" aria-hidden="true">
        <span className="decision-chart-zone is-raise" style={{ left: 0, width: at(raiseEnd) }} />
        <span className="decision-chart-zone is-play" style={{ left: at(raiseEnd), width: `calc(${at(playEnd)} - ${at(raiseEnd)})` }} />
        <span className="decision-chart-marker" style={{ left: at(handTop) }} />
      </div>
      <div className="decision-chart-legend">
        <span>
          <i className="is-raise" /> {thresholds.kind === 'unopened' ? 'Open' : 'Raise'} (top {pct(raiseEnd)})
        </span>
        {playEnd > raiseEnd + 0.001 && (
          <span>
            <i className="is-play" /> {thresholds.kind === 'unopened' ? 'Play' : 'Call'} (to {pct(playEnd)})
          </span>
        )}
        <span>
          <i className="is-hand" /> Your hand (top {pct(handTop)})
        </span>
      </div>
    </div>
  );
}

// EV of every option as diverging bars from zero; the best option and yours are marked.
function EvList({ options }) {
  const maxAbs = Math.max(1e-9, ...options.map((o) => Math.abs(o.ev)));
  return (
    <ul className="decision-ev">
      {options.map((option) => {
        const width = (Math.abs(option.ev) / maxAbs) * 50;
        return (
          <li key={option.label} className={`decision-ev-row ${option.isBest ? 'is-best' : ''} ${option.isActual ? 'is-actual' : ''}`}>
            <span className="decision-ev-label">
              {option.label}
              {option.isBest && <span className="decision-tag is-best">Best</span>}
              {option.isActual && <span className="decision-tag is-actual">You</span>}
            </span>
            <span className="decision-ev-track">
              <span
                className={`decision-ev-bar ${option.ev < 0 ? 'is-negative' : ''}`}
                style={option.ev < 0 ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }}
              />
            </span>
            <span className={`decision-ev-value num ${option.ev < 0 ? 'is-negative' : ''}`}>{signed(option.ev)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function DecisionCard({ decision, number }) {
  const d = decision;
  const yourPlay = d.kind === 'chart' ? d.actualLabel : d.actual.label;
  const bestPlay = d.kind === 'chart' ? CHART_WORDS[d.advice.best] : d.best.label;
  const needed = d.toCall > 0 ? d.toCall / (d.pot + d.toCall) : null;

  return (
    <article className={`decision-card is-${d.grade.id}`}>
      <header className="decision-card-header">
        <span className="decision-card-number">{number}</span>
        <span className="decision-card-street">{d.street}</span>
        {d.board.length > 0 && (
          <span className="decision-card-board">
            {d.board.map((code) => (
              <PlayingCard key={code} code={code} size="xs" />
            ))}
          </span>
        )}
        <span className={`decision-grade is-${d.grade.id}`}>
          {d.grade.label} <span className="num">{d.score}</span>
        </span>
      </header>

      <p className="decision-card-hand">{d.heroHand.text}</p>

      {/* You vs. the coach */}
      <div className="decision-compare">
        <div className="decision-compare-item">
          <span className="decision-compare-label">You</span>
          <span className="decision-compare-value">{yourPlay}</span>
        </div>
        <Icon name="chevronRight" size={18} className="decision-compare-arrow" />
        <div className="decision-compare-item is-coach">
          <span className="decision-compare-label">Coach</span>
          <span className="decision-compare-value">{bestPlay}</span>
        </div>
      </div>

      {/* Key numbers */}
      <dl className="decision-numbers">
        <div>
          <dt>Pot</dt>
          <dd className="num">{dollars(d.pot)}</dd>
        </div>
        {d.toCall > 0 && (
          <div>
            <dt>To call</dt>
            <dd className="num">{dollars(d.toCall)}</dd>
          </div>
        )}
        {needed !== null && (
          <div>
            <dt>Equity needed</dt>
            <dd className="num">{pct(needed)}</dd>
          </div>
        )}
        {d.equity != null && (
          <div>
            <dt>Your equity</dt>
            <dd className="num">{pct(d.equity)}</dd>
          </div>
        )}
        {d.equityVsActual != null && (
          <div>
            <dt>Vs their cards</dt>
            <dd className="num">{pct(d.equityVsActual)}</dd>
          </div>
        )}
        {d.kind === 'ev' && d.best.kind === 'raise' && (
          <div>
            <dt>Fold equity</dt>
            <dd className="num">{pct(d.best.foldEquity)}</dd>
          </div>
        )}
      </dl>

      {d.kind === 'chart' ? <ChartScale thresholds={d.thresholds} handTop={d.handTop} /> : <EvList options={d.options} />}

      <ul className="decision-notes">
        {d.notes.map((note) => (
          <li key={note}>
            <Icon name="bulb" size={16} />
            <span>{note}</span>
          </li>
        ))}
      </ul>

      {/* What the coach thinks each villain holds at this point */}
      {d.reads.map((read) => (
        <details key={read.seat} className="decision-read">
          <summary>
            <Icon name="villain" size={16} />
            <span>
              {read.position} · {read.label} · about {pct(read.width)} of hands
            </span>
          </summary>
          <p className="decision-read-top">Most likely: {read.top.join(', ')}</p>
          <RangeGrid grid={read.grid} label={`${read.position} range`} />
        </details>
      ))}
    </article>
  );
}
