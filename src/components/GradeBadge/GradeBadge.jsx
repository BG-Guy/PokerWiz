// A letter grade (A to F) for a 0-100 score, as a small colored tile: green for A and B, neutral for C, amber
// for D, red for F. Used wherever the app shows the coach's accuracy, a decision or a session grade.
import { letterGrade } from '../../utils/letterGrade.js';
import './GradeBadge.css';

// score: 0-100 (or null: a dash). size: 'xs' | 'sm' | 'md' | 'lg'. withLabel adds the word ("Good") after it.
// reveal plays a short pop-in when it first shows (the result of a hand just graded).
export default function GradeBadge({ score, size = 'sm', withLabel = false, reveal = false, className = '' }) {
  const grade = letterGrade(score);
  const tone = grade?.tone ?? 'none';
  const name = grade ? `Grade ${grade.letter}, ${grade.label}` : 'Not graded';
  return (
    <span className={`grade-badge is-${tone} is-${size} ${reveal ? 'is-reveal' : ''} ${className}`} role="img" aria-label={name} title={name}>
      <span className="grade-badge-letter" aria-hidden="true">
        {grade?.letter ?? '–'}
      </span>
      {withLabel && grade && (
        <span className="grade-badge-label" aria-hidden="true">
          {grade.label}
        </span>
      )}
    </span>
  );
}
