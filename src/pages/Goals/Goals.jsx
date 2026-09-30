// Goals page: an insight summary across all goals, then one card per goal with pace and trend.
import { Link } from 'react-router-dom';
import { getGoals } from '../../api/goals.js';
import { useApi } from '../../hooks/useApi.js';
import { todayIso } from '../../utils/format.js';
import { analyzeGoal, findFocusGoal } from '../../utils/goalInsights.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import GoalCard from './GoalCard.jsx';
import './Goals.css';

// Where to go to work on each kind of goal.
const CATEGORY_ACTIONS = {
  Study: { to: '/hands', label: 'Open Hand Review' },
  Discipline: { to: '/insights', label: 'See your stats' },
  Volume: { to: '/history', label: 'See sessions' },
  Results: { to: '/history', label: 'See sessions' },
};

export default function Goals() {
  const { data: goals, error, reload } = useApi(getGoals);
  if (!goals) return <LoadState error={error} onRetry={reload} />;

  const today = todayIso();
  const analyzed = goals.map((goal) => ({ goal, analysis: analyzeGoal(goal, today) }));
  const onTrackCount = analyzed.filter(({ analysis }) => analysis.status === 'on-track' || analysis.status === 'done').length;
  const focus = findFocusGoal(analyzed);
  const focusAction = focus && CATEGORY_ACTIONS[focus.goal.category];

  return (
    <div className="goals">
      <PageHeader title="Goals" subtitle="Track what you are working on and whether your pace gets you there." />

      {/* Summary insights across all goals */}
      <section className="goals-summary">
        <div className="goals-summary-score">
          <span className="goals-summary-number num">
            {onTrackCount}
            <span className="goals-summary-total">/{analyzed.length}</span>
          </span>
          <span className="goals-summary-caption">goals on track</span>
        </div>

        {focus && (
          <div className="goals-summary-focus">
            <span className="goals-summary-kicker">
              <Icon name="target" size={16} /> Focus next
            </span>
            <p className="goals-summary-focus-title">{focus.goal.title}</p>
            <p className="goals-summary-focus-text">
              You have used {Math.round(focus.analysis.timeShare * 100)}% of the time but are only{' '}
              {Math.round(focus.analysis.progress * 100)}% of the way there. This is the goal most at risk.
            </p>
            {focusAction && (
              <Link to={focusAction.to} className="btn goals-summary-action">
                {focusAction.label} <Icon name="chevronRight" size={16} />
              </Link>
            )}
          </div>
        )}
      </section>

      {/* One card per goal */}
      <div className="goals-grid">
        {analyzed.map(({ goal, analysis }) => (
          <GoalCard key={goal.id} goal={goal} analysis={analysis} />
        ))}
      </div>
    </div>
  );
}
