// A session's grade (utils/sessionGrade.js): the letter and its word, then each part (decisions, results, time
// played) with its own letter, a bar, what it's based on and how much it counts.
import ProgressBar from '../../components/ProgressBar/ProgressBar.jsx';
import GradeBadge from '../../components/GradeBadge/GradeBadge.jsx';
import { letterGrade } from '../../utils/letterGrade.js';
import './SessionGradeCard.css';

// The bar's color follows the part's letter: A-C in the accent, D amber, F red.
const BAR_TONES = { good: 'accent', neutral: 'accent', warning: 'warning', bad: 'negative' };

export default function SessionGradeCard({ grade }) {
  return (
    <section className={`session-grade is-${grade.letter.toLowerCase()}`} aria-label={`Session grade ${grade.letter}, ${grade.label}`}>
      <div className="session-grade-head">
        <GradeBadge score={grade.score} size="lg" reveal />
        <span className="session-grade-title">
          <strong>{grade.label}</strong>
          <span>Session grade, from A to F</span>
        </span>
      </div>
      <ul className="session-grade-parts">
        {grade.parts.map((part) => (
          <li key={part.key}>
            <span className="session-grade-part-name">
              {part.name} <span className="session-grade-weight">{Math.round(part.weight * 100)}%</span>
            </span>
            <GradeBadge score={part.score} size="xs" className="session-grade-part-score" />
            <ProgressBar value={part.score / 100} tone={BAR_TONES[letterGrade(part.score).tone]} label={`${part.name}: grade ${letterGrade(part.score).letter}`} />
            <span className="session-grade-part-detail">{part.detail}</span>
          </li>
        ))}
      </ul>
      {grade.note && <p className="session-grade-note">{grade.note}</p>}
    </section>
  );
}
