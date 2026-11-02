// Grade ring for a hand: the ring fills with the accuracy (0-100) and the letter grade (A to F, utils/letterGrade.js)
// lands in the middle once it's full, colored by grade, with its word underneath. A thin gold rim frames it.
import { useId } from 'react';
import { letterGrade } from '../../utils/letterGrade.js';
import './AccuracyGauge.css';

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// value: the accuracy, 0-100, or null when nothing was graded.
export default function AccuracyGauge({ value }) {
  const grade = letterGrade(value);
  const fill = grade ? Math.max(0, Math.min(100, value)) : 0;
  const gradientId = `gauge-${useId().replace(/[^a-zA-Z0-9]/g, '')}`; // safe inside url(#...)
  return (
    <div className={`accuracy-gauge is-${grade?.tone ?? 'none'}`} role="img" aria-label={grade ? `Grade ${grade.letter}, ${grade.label}` : 'Not graded'}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          {/* The arc runs from a lighter shade of the grade's color to the full color */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--tone-light)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--tone)' }} />
          </linearGradient>
        </defs>
        <circle className="accuracy-gauge-rim" cx="60" cy="60" r="58" />
        <circle className="accuracy-gauge-track" cx="60" cy="60" r={RADIUS} />
        <circle
          className="accuracy-gauge-value"
          cx="60"
          cy="60"
          r={RADIUS}
          stroke={`url(#${gradientId})`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fill / 100)}
          style={{ '--circumference': CIRCUMFERENCE }}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="accuracy-gauge-center">
        <span className="accuracy-gauge-letter">{grade?.letter ?? '–'}</span>
        <span className="accuracy-gauge-label">{grade?.label ?? 'No decisions'}</span>
      </div>
    </div>
  );
}
