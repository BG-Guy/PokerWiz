// The coach's report for one hand: accuracy gauge and summary, the players and reads, every decision,
// and a short explanation of how the numbers are made.
import { Link } from 'react-router-dom';
import Money from '../../components/Money/Money.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import AccuracyGauge from './AccuracyGauge.jsx';
import DecisionCard from './DecisionCard.jsx';
import './CoachReport.css';

const GRADE_ORDER = [
  { id: 'best', label: 'Best' },
  { id: 'good', label: 'Good' },
  { id: 'inaccuracy', label: 'Inaccuracies' },
  { id: 'mistake', label: 'Mistakes' },
  { id: 'blunder', label: 'Blunders' },
];

// saveState: null | 'saving' | { id } (saved) | { error }
// backTo: link to the saved hand being reviewed (reviews started from Hands), or null.
export default function CoachReport({ report, onNewHand, onSave, saveState, canSave, backTo = null }) {
  const pct = (x) => `${Math.round(x * 100)}%`;

  return (
    <div className="coach-report">
      {/* Summary */}
      <section className="coach-report-summary">
        <AccuracyGauge value={report.accuracy ?? 0} label={report.label} />
        <div className="coach-report-summary-text">
          <span className="coach-report-kicker">Hand accuracy</span>
          <p className="coach-report-headline">
            {report.decisions.length} {report.decisions.length === 1 ? 'decision' : 'decisions'} reviewed ·{' '}
            {report.evLostBB > 0 ? `${report.evLostBB} bb given up to the best lines` : 'no EV given up'}
          </p>
          <div className="coach-report-grades">
            {GRADE_ORDER.filter((g) => report.counts[g.id] > 0).map((g) => (
              <span key={g.id} className={`coach-report-grade is-${g.id}`}>
                {report.counts[g.id]} {g.label}
              </span>
            ))}
          </div>
          <p className="coach-report-result">
            Result <Money amount={report.result ?? 0} />
          </p>
        </div>
      </section>

      {report.keyLesson && (
        <p className="coach-report-lesson">
          <Icon name="target" size={18} />
          <span>
            <strong>Biggest leak.</strong> {report.keyLesson.text}
          </span>
        </p>
      )}

      {/* Players and reads */}
      <section className="coach-report-players">
        <div className="coach-report-player is-hero">
          <span className="prompt-player-avatar is-hero">
            <Icon name="hero" size={16} />
          </span>
          <span className="coach-report-player-text">
            <strong>You · {report.hero.position}</strong>
            <span>{report.hero.label}</span>
          </span>
          <span className="coach-report-player-cards">
            {report.hero.cards.map((code) => (
              <PlayingCard key={code} code={code} size="sm" />
            ))}
          </span>
        </div>
        {report.villains.map((villain) => (
          <div key={villain.seat} className="coach-report-player">
            <span className="prompt-player-avatar is-villain">
              <Icon name="villain" size={16} />
            </span>
            <span className="coach-report-player-text">
              <strong>{villain.position}</strong>
              <span>
                {villain.label} · ends on ~{pct(villain.finalWidth)} of hands
              </span>
            </span>
            <span className="coach-report-player-cards">
              {villain.cards.length === 2
                ? villain.cards.map((code) => <PlayingCard key={code} code={code} size="sm" />)
                : [0, 1].map((i) => <PlayingCard key={i} faceDown size="sm" />)}
            </span>
          </div>
        ))}
      </section>

      {/* Every decision */}
      <section className="coach-report-decisions">
        {report.decisions.map((decision, index) => (
          <DecisionCard key={index} decision={decision} number={index + 1} />
        ))}
      </section>

      {/* How it works */}
      <details className="coach-report-method">
        <summary>How the coach grades a hand</summary>
        <ul>
          <li>Every villain starts with all possible hands. Each action they take reweights their range by how likely a player with their traits is to take it with each hand.</li>
          <li>Preflop spots are checked against position-based ranges (solver-style charts), widened or tightened by the opener's traits.</li>
          <li>Postflop, every option is valued in chips: your equity against their ranges, the price, how often they fold (pot odds vs. the range they put you on), and what you realize in or out of position.</li>
          <li>Accuracy compares your play with the best option. Losing a bigger share of the pot costs more; your level sets how strict the grading is.</li>
          <li>These are model estimates, not solver output. The better your reads, the better the advice.</li>
        </ul>
      </details>

      <div className="coach-report-actions">
        <button type="button" className="btn btn-ghost" onClick={onNewHand}>
          <Icon name="undo" size={16} /> {backTo ? 'Coach a new hand' : 'Analyze another hand'}
        </button>
        {backTo && (
          <Link to={backTo} className="btn">
            <Icon name="cards" size={16} /> Back to the hand
          </Link>
        )}
        {canSave &&
          (saveState?.id ? (
            <Link to={`/hands/${saveState.id}`} className="btn">
              <Icon name="check" size={16} /> Saved, open in Hands
            </Link>
          ) : (
            <button type="button" className="btn" disabled={saveState === 'saving'} onClick={onSave}>
              <Icon name="cards" size={16} /> {saveState === 'saving' ? 'Saving' : 'Save to my hands'}
            </button>
          ))}
      </div>
      {saveState?.error && (
        <p className="coach-report-error" role="alert">
          {saveState.error}
        </p>
      )}
    </div>
  );
}
