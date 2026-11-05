// "Practice this spot": opens Practice set up for the kind of spot being browsed (BB vs BTN open ...), through the
// focus parameters Practice reads (coach/spots.js). Nothing shows for spots Practice can't drill (limped pots, rare lines).
import { Link } from 'react-router-dom';
import { focusToParams } from '../../coach/spots.js';
import Icon from '../../components/Icon/Icon.jsx';
import './PracticeLink.css';

export default function PracticeLink({ scenario, compact = false }) {
  if (!scenario.focus) return null;
  return (
    <Link to={`/practice?${focusToParams(scenario.focus)}`} className={`rg-practice ${compact ? 'is-compact' : ''}`}>
      <span className="rg-practice-icon">
        <Icon name="zap" size={18} />
      </span>
      <span className="rg-practice-text">
        <span className="rg-practice-title">Practice this spot</span>
        {!compact && <span className="rg-practice-sub">Play hands of {scenario.title} against the solver</span>}
      </span>
      <Icon name="chevronRight" size={18} />
    </Link>
  );
}
