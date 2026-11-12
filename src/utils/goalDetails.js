// The detailed view behind one goal (the sheet a goal opens on the home page): how far along it is against the
// time used, where the current pace lands, what's needed from here, and where to go to work on it. Pure: plain
// data for StatDetail.
import { analyzeGoal, GOAL_STATUS } from './goalInsights.js';
import { formatGoalValue, formatLongDate } from './format.js';

const STATUS_TONES = { done: 'positive', 'on-track': 'positive', behind: 'negative' };

// Where to go to work on each kind of goal.
export const CATEGORY_ACTIONS = {
  Study: { to: '/hands', label: 'Open Hand Review' },
  Discipline: { to: '/insights', label: 'See your stats' },
  Volume: { to: '/history', label: 'See sessions' },
  Results: { to: '/history', label: 'See sessions' },
};

// All your goals at a glance (what the score on the Goals page opens): which are on track, and how each one's
// progress compares with the time it has used. analyzed: [{ goal, analysis }] (analyzeGoal).
export function goalsOverview(analyzed) {
  const onTrack = analyzed.filter(({ analysis }) => analysis.status === 'on-track' || analysis.status === 'done').length;
  return {
    title: 'Goals on track',
    lead: { value: `${onTrack} of ${analyzed.length}`, tone: onTrack === analyzed.length ? 'positive' : undefined, caption: 'reach their target at the pace so far' },
    sections: [
      {
        type: 'list',
        title: 'Every goal',
        items: analyzed.map(({ goal, analysis }) => ({
          label: goal.title,
          hint: `${GOAL_STATUS[analysis.status]} · ${Math.round(analysis.timeShare * 100)}% of the time used · ${analysis.daysLeft} days left`,
          value: `${Math.round(analysis.progress * 100)}%`,
          tone: STATUS_TONES[analysis.status],
        })),
      },
      {
        type: 'text',
        title: 'How it is judged',
        paragraphs: [
          'A goal is on track when its pace so far, carried on in a straight line, reaches the target by the deadline. Slightly behind means it lands within 15% of it; behind means further off.',
          'The tick on each bar is where you would be today at an even pace.',
        ],
      },
    ],
  };
}

// goal: as saved (start, current, target, unit, startDate, deadline, history: one value a week). today: ISO date.
export function goalDetail(goal, today) {
  const analysis = analyzeGoal(goal, today);
  const fmt = (value) => formatGoalValue(value, goal.unit);
  const action = CATEGORY_ACTIONS[goal.category];
  const reaches = Math.abs(analysis.projected - goal.start) >= Math.abs(goal.target - goal.start);
  return {
    title: goal.title,
    lead: {
      value: `${Math.round(analysis.progress * 100)}%`,
      tone: STATUS_TONES[analysis.status],
      caption: `${GOAL_STATUS[analysis.status]}: ${fmt(goal.current)} of ${fmt(goal.target)}`,
    },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'So far', value: fmt(goal.current) },
          { label: 'To go', value: fmt(Math.abs(goal.target - goal.current)), hint: analysis.status === 'done' ? 'past the target' : undefined },
          { label: 'Time used', value: `${Math.round(analysis.timeShare * 100)}%`, hint: `${analysis.daysLeft} days left` },
          { label: 'At this pace', value: fmt(analysis.projected), tone: reaches ? 'positive' : 'negative', hint: `by ${formatLongDate(goal.deadline)}` },
        ],
      },
      goal.history.length > 1 && {
        type: 'bars',
        title: 'Week by week',
        signed: false,
        items: goal.history.map((value, week) => ({ key: week, label: `W${week + 1}`, value, display: fmt(value), title: `Week ${week + 1}` })),
      },
      { type: 'text', title: 'Where it stands', paragraphs: analysis.insights },
      {
        type: 'actions',
        items: [action && { label: action.label, to: action.to, primary: true }, { label: 'All goals', to: '/goals', icon: 'target' }].filter(Boolean),
      },
    ],
  };
}
