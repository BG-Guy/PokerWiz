// One graded decision in the coach report: what you did vs. the GTO play, how often GTO takes each option
// with your hand and what each is worth, the numbers behind the spot (price, equity), the coach's notes, and
// each villain's range at that point.
import { formatMoney } from '../../utils/format.js';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import RangeGrid from './RangeGrid.jsx';
import './DecisionCard.css';

const pct = (x) => `${Math.round(x * 100)}%`;
// Amounts in big blinds or dollars; bb is the hand's big blind.
const plain = (n, bb) => formatMoney(Math.round(n * 100) / 100, { sign: false, bb });
const signed = (n, bb) => formatMoney(Math.round(n * 100) / 100, { bb });

// Every option: how often GTO takes it with this hand (bar) and its value (relative to folding).
function GtoOptions({ options, bb }) {
  const hasValues = options.some((o) => o.ev !== null && o.ev !== undefined);
  return (
    <div className="decision-gto">
      <div className={`decision-gto-head ${hasValues ? '' : 'no-values'}`} aria-hidden="true">
        <span>Option</span>
        <span>GTO plays it</span>
        {hasValues && <span>Value</span>}
      </div>
      <ul className="decision-gto-list">
        {options.map((option) => (
          <li key={option.label} className={`decision-gto-row ${option.isBest ? 'is-best' : ''} ${option.isActual ? 'is-actual' : ''} ${hasValues ? '' : 'no-values'}`}>
            <span className="decision-ev-label">
              {option.label}
              {option.isBest && <span className="decision-tag is-best">GTO</span>}
              {option.isActual && <span className="decision-tag is-actual">You</span>}
            </span>
            <span className="decision-gto-frequency">
              <span className="decision-gto-track">
                <span className="decision-gto-bar" style={{ width: pct(option.frequency) }} />
              </span>
              <span className="num">{pct(option.frequency)}</span>
            </span>
            {hasValues && <span className={`decision-ev-value num ${option.ev < 0 ? 'is-negative' : ''}`}>{option.ev === null ? '–' : signed(option.ev, bb)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DecisionCard({ decision, number, bb = null }) {
  const d = decision;
  const needed = d.facingBet ? d.toCall / (d.pot + d.toCall) : null;
  const gradeId = d.graded ? d.grade.id : 'ungraded';

  return (
    <article className={`decision-card is-${gradeId}`}>
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
        <span className={`decision-grade is-${gradeId}`}>
          {d.graded ? (
            <>
              {d.grade.label} <span className="num">{d.score}</span>
            </>
          ) : (
            'Not graded'
          )}
        </span>
      </header>

      <p className="decision-card-hand">{d.heroHand.text}</p>

      {d.graded && (
        <>
          {/* You vs. GTO */}
          <div className="decision-compare">
            <div className="decision-compare-item">
              <span className="decision-compare-label">You</span>
              <span className="decision-compare-value">{d.actual.label}</span>
            </div>
            <Icon name="chevronRight" size={18} className="decision-compare-arrow" />
            <div className="decision-compare-item is-coach">
              <span className="decision-compare-label">GTO</span>
              <span className="decision-compare-value">{d.best.label}</span>
            </div>
          </div>

          {/* Key numbers */}
          <dl className="decision-numbers">
            <div>
              <dt>Pot</dt>
              <dd className="num">{plain(d.pot, bb)}</dd>
            </div>
            {d.toCall > 0 && (
              <div>
                <dt>To call</dt>
                <dd className="num">{plain(d.toCall, bb)}</dd>
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
            {d.evLoss > 0 && (
              <div>
                <dt>Given up</dt>
                <dd className="num">{plain(d.evLoss, bb)}</dd>
              </div>
            )}
          </dl>

          <GtoOptions options={d.options} bb={bb} />
        </>
      )}

      <ul className="decision-notes">
        {d.notes.map((note) => (
          <li key={note}>
            <Icon name="bulb" size={16} />
            <span>{note}</span>
          </li>
        ))}
      </ul>

      {/* Each villain's GTO range at this point */}
      {d.reads.map((read) => (
        <details key={read.seat} className="decision-read">
          <summary>
            <Icon name="villain" size={16} />
            <span>
              {read.position} · GTO range · about {pct(read.width)} of hands
            </span>
          </summary>
          {read.top.length > 0 && <p className="decision-read-top">Most likely: {read.top.join(', ')}</p>}
          <RangeGrid grid={read.grid} label={`${read.position} range`} />
        </details>
      ))}
    </article>
  );
}
