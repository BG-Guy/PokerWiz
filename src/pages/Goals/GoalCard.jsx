// One goal: current vs. target, progress against time, weekly trend, and generated insights. Edit opens the goal sheet.
import { GOAL_STATUS, statusTone } from '../../utils/goalInsights.js';
import { formatGoalValue, formatLongDate } from '../../utils/format.js';
import ProgressBar from '../../components/ProgressBar/ProgressBar.jsx';
import LineChart from '../../components/LineChart/LineChart.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './GoalCard.css';

export default function GoalCard({ goal, analysis, onEdit }) {
  const trend = goal.history.map((value, week) => ({ label: `Week ${week + 1}`, value }));

  return (
    <article className="goal-card">
      <div className="goal-card-top">
        <span className="goal-card-category">{goal.category}</span>
        <span className={`goal-card-status is-${analysis.status}`}>{GOAL_STATUS[analysis.status]}</span>
        <button type="button" className="btn-icon goal-card-edit" onClick={onEdit} aria-label={`Edit goal: ${goal.title}`}>
          <Icon name="pencil" size={16} />
        </button>
      </div>

      <h3 className="goal-card-title">{goal.title}</h3>

      {/* Current value vs. target, with a small trend line */}
      <div className="goal-card-values">
        <div>
          <span className="goal-card-current num">{formatGoalValue(goal.current, goal.unit)}</span>
          <span className="goal-card-target">of {formatGoalValue(goal.target, goal.unit)}</span>
        </div>
        <div className="goal-card-trend" aria-hidden="true">
          <LineChart data={trend} height={48} compact />
        </div>
      </div>

      {/* Progress bar; the tick marks how much of the time window has passed */}
      <ProgressBar value={analysis.progress} marker={analysis.timeShare} tone={statusTone(analysis.status)} label={goal.title} />
      <div className="goal-card-legend">
        <span>{Math.round(analysis.progress * 100)}% done</span>
        <span>{Math.round(analysis.timeShare * 100)}% of time used</span>
      </div>

      {/* Generated insights about pace and trend */}
      <ul className="goal-card-insights">
        {analysis.insights.map((text) => (
          <li key={text}>
            <Icon name="bulb" size={16} />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <footer className="goal-card-footer">
        <Icon name="calendar" size={16} />
        Due {formatLongDate(goal.deadline)} · {analysis.daysLeft} days left
      </footer>
    </article>
  );
}
