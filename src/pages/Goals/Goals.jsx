// Goals page: an insight summary across all goals, then one card per goal with pace and trend.
// "New goal" and each card's edit button open the goal sheet (add, change or delete a goal).
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGoals } from '../../api/goals.js';
import { useApi } from '../../hooks/useApi.js';
import { useClosingValue } from '../../hooks/useClosingValue.js';
import { todayIso } from '../../utils/format.js';
import { analyzeGoal, findFocusGoal } from '../../utils/goalInsights.js';
import { CATEGORY_ACTIONS, goalsOverview } from '../../utils/goalDetails.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import DetailSheet from '../../components/DetailSheet/DetailSheet.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import GoalCard from './GoalCard.jsx';
import GoalSheet from './GoalSheet.jsx';
import './Goals.css';

export default function Goals() {
  const { data: goals, error, reload, setData } = useApi(getGoals);
  const [sheet, setSheet] = useState(null); // 'new', the goal being edited, or null
  const [goalSheet, goalSheetOpen] = useClosingValue(sheet); // stays up while it slides closed
  const [overview, setOverview] = useState(false); // the score's sheet: every goal at a glance
  const scoreRef = useRef(null);
  if (!goals) return <LoadState error={error} onRetry={reload} />;

  // Keep the list in step with the sheet: add or replace the saved goal, or drop a deleted one.
  const saveGoal = (saved) => setData((list) => (list.some((g) => g.id === saved.id) ? list.map((g) => (g.id === saved.id ? saved : g)) : [...list, saved]));
  const removeGoal = (id) => setData((list) => list.filter((g) => g.id !== id));

  const today = todayIso();
  const analyzed = goals.map((goal) => ({ goal, analysis: analyzeGoal(goal, today) }));
  const onTrackCount = analyzed.filter(({ analysis }) => analysis.status === 'on-track' || analysis.status === 'done').length;
  const focus = findFocusGoal(analyzed);
  const focusAction = focus && CATEGORY_ACTIONS[focus.goal.category];

  return (
    <div className="goals">
      <PageHeader title="Goals" subtitle="Track what you are working on and whether your pace gets you there.">
        <button type="button" className="btn" onClick={() => setSheet('new')}>
          <Icon name="plus" size={16} /> New goal
        </button>
      </PageHeader>

      {/* No goals yet: invite the first one */}
      {analyzed.length === 0 && (
        <section className="goals-empty">
          <Icon name="target" size={28} />
          <p className="goals-empty-title">No goals yet</p>
          <p>Pick something to track (hands, hours, sessions, profit or hands reviewed), set a target and a deadline.</p>
          <button type="button" className="btn" onClick={() => setSheet('new')}>
            <Icon name="plus" size={16} /> Add your first goal
          </button>
        </section>
      )}

      {/* Summary insights across all goals */}
      {analyzed.length > 0 && (
        <section className="goals-summary">
          {/* The score: tap it for every goal at a glance */}
          <button type="button" className="goals-summary-score" onClick={() => setOverview(true)} ref={scoreRef} aria-haspopup="dialog">
            <span className="goals-summary-number num">
              {onTrackCount}
              <span className="goals-summary-total">/{analyzed.length}</span>
            </span>
            <span className="goals-summary-caption">
              goals on track <Icon name="chevronRight" size={14} />
            </span>
          </button>

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
      )}

      {/* One card per goal */}
      <div className="goals-grid">
        {analyzed.map(({ goal, analysis }) => (
          <GoalCard key={goal.id} goal={goal} analysis={analysis} onEdit={() => setSheet(goal)} />
        ))}
      </div>

      <DetailSheet open={overview} onClose={() => setOverview(false)} title="Goals on track" originRef={scoreRef}>
        {analyzed.length > 0 && <StatDetail detail={goalsOverview(analyzed)} />}
      </DetailSheet>

      {goalSheet && (
        <GoalSheet
          key={goalSheet === 'new' ? 'new' : goalSheet.id}
          goal={goalSheet === 'new' ? null : goalSheet}
          open={goalSheetOpen}
          onClose={() => setSheet(null)}
          onSaved={saveGoal}
          onDeleted={() => removeGoal(goalSheet.id)}
        />
      )}
    </div>
  );
}
