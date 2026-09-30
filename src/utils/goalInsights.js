// Goal analysis: turns a goal's numbers into progress, pace, status and plain-language insights.
import { daysBetween, formatGoalValue, formatLongDate } from './format.js';

export const GOAL_STATUS = {
  done: 'Completed',
  'on-track': 'On track',
  close: 'Slightly behind',
  behind: 'Behind',
};

// Progress-bar color for each status.
export function statusTone(status) {
  if (status === 'close') return 'warning';
  if (status === 'behind') return 'negative';
  return 'accent';
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Work out how a goal is doing as of `today` (ISO date).
export function analyzeGoal(goal, today) {
  const { start, current, target, unit } = goal;
  const span = target - start;

  // Progress vs. time: how far toward the target, and how much of the window has passed.
  const totalDays = Math.max(1, daysBetween(goal.startDate, goal.deadline));
  const elapsedDays = clamp(daysBetween(goal.startDate, today), 1, totalDays);
  const daysLeft = Math.max(0, daysBetween(today, goal.deadline));
  const progress = clamp((current - start) / span, 0, 1);
  const timeShare = elapsedDays / totalDays;

  // Straight-line projection of the current pace to the deadline.
  const projected = start + (current - start) * (totalDays / elapsedDays);
  const projectedProgress = (projected - start) / span;

  let status = 'behind';
  if (progress >= 1) status = 'done';
  else if (projectedProgress >= 1) status = 'on-track';
  else if (projectedProgress >= 0.85) status = 'close';

  // Weekly pace so far vs. the pace needed from here on.
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  const pacePerWeek = Math.abs(current - start) / (elapsedDays / 7);
  const neededPerWeek = Math.abs(target - current) / weeksLeft;

  const fmt = (value) => formatGoalValue(value, unit);
  const insights = [];

  // Insight 1: where the current pace lands by the deadline.
  if (status === 'done') {
    insights.push(`Target reached with ${daysLeft} days to spare. Time to set the bar higher.`);
  } else {
    const gap = fmt(Math.abs(projected - target));
    insights.push(
      projectedProgress >= 1
        ? `At this pace you finish near ${fmt(projected)} by ${formatLongDate(goal.deadline)}, ${gap} past the target.`
        : `At this pace you finish near ${fmt(projected)} by ${formatLongDate(goal.deadline)}, ${gap} short.`
    );
    // Insight 2: required weekly pace vs. the actual weekly pace.
    insights.push(
      `You need about ${fmt(neededPerWeek)} per week for the next ${weeksLeft} weeks. So far you average ${fmt(pacePerWeek)}.`
    );
  }

  // Insight 3: direction over the last three data points.
  const recent = goal.history.slice(-3);
  if (recent.length === 3) {
    const recentMove = (recent[2] - recent[0]) * Math.sign(span);
    insights.push(
      recentMove > 0
        ? 'The last three weeks are moving the right way.'
        : 'Progress has stalled over the last three weeks.'
    );
  }

  return { progress, timeShare, projected, status, daysLeft, insights };
}

// The goal that is furthest behind schedule (largest gap between time used and progress made).
export function findFocusGoal(analyzedGoals) {
  return analyzedGoals
    .filter(({ analysis }) => analysis.status !== 'done')
    .reduce((worst, item) => {
      const gap = item.analysis.timeShare - item.analysis.progress;
      const worstGap = worst ? worst.analysis.timeShare - worst.analysis.progress : -Infinity;
      return gap > worstGap ? item : worst;
    }, null);
}
