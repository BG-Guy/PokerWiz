// A session's grade (utils/sessionGrade.js): the letter and score, then each part (decisions, results, time
// played) with a bar, what it's based on and how much it counts.
import ProgressBar from '../../components/ProgressBar/ProgressBar.jsx';
import './SessionGradeCard.css';

export default function SessionGradeCard({ grade }) {
  return (
    <section className={`session-grade is-${grade.letter.toLowerCase()}`} aria-label={`Session grade ${grade.letter}, ${grade.score} out of 100`}>
      <div className="session-grade-head">
        <span className="session-grade-letter">{grade.letter}</span>
        <span className="session-grade-title">
          <strong>{grade.label}</strong>
          <span className="num">{grade.score} / 100</span>
        </span>
      </div>
      <ul className="session-grade-parts">
        {grade.parts.map((part) => (
          <li key={part.key}>
            <span className="session-grade-part-name">
              {part.name} <span className="session-grade-weight">{Math.round(part.weight * 100)}%</span>
            </span>
            <span className="num session-grade-part-score">{part.score}</span>
            <ProgressBar value={part.score / 100} tone={part.score >= 60 ? 'accent' : part.score >= 40 ? 'warning' : 'negative'} label={`${part.name}: ${part.score}`} />
            <span className="session-grade-part-detail">{part.detail}</span>
          </li>
        ))}
      </ul>
      {grade.note && <p className="session-grade-note">{grade.note}</p>}
    </section>
  );
}
