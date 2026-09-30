// Session insights: leaks and strengths computed from finished sessions only (venue, stakes, game, day of
// the week, session length, tilt and your own rating). Nothing here needs a hand tracker.
import { sessionProfit, hourlyBy, sessionLengthSplit } from './stats.js';
import { formatUnits, getMoneyUnit, parseDate } from './format.js';

const perHour = (v) => `${formatUnits(v, { whole: true })}/h`; // sessions arrive converted (sessionsForDisplay)
const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const TILT_LABELS = ['', 'Zen', 'Calm', 'Uneasy', 'Frustrated', 'Full tilt'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Hourly by day of the week (only days with sessions).
export function hourlyByWeekday(sessions) {
  const withDay = sessions.map((s) => ({ ...s, weekday: WEEKDAYS[parseDate(s.date).getDay()] }));
  return hourlyBy(withDay, 'weekday');
}

// Average session result at each tilt level you recorded.
export function resultsByTilt(sessions) {
  return [1, 2, 3, 4, 5]
    .map((level) => {
      const at = sessions.filter((s) => s.tilt === level);
      return at.length ? { label: TILT_LABELS[level], value: average(at.map(sessionProfit)) } : null;
    })
    .filter(Boolean);
}

// Leaks (things costing money) and strengths (what's working), strongest signals first.
export function sessionFindings(sessions) {
  const findings = [];

  // Long sessions vs. short ones.
  const split = sessionLengthSplit(sessions);
  if (split.longCount >= 2 && split.shortCount >= 2 && split.longAvg < split.shortAvg - 20) {
    findings.push({
      id: 'length',
      severity: split.longAvg < 0 ? 'high' : 'medium',
      title: 'Long sessions cost you',
      detail: `Sessions over ${split.cutoffMin / 60} hours average ${formatUnits(split.longAvg, { whole: true })}; shorter ones average ${formatUnits(split.shortAvg, { whole: true })}.`,
      action: `Set a hard stop at the ${split.cutoffMin / 60}-hour mark.`,
    });
  }

  // Tilt: sessions you rated tilted vs. calm ones.
  const calm = sessions.filter((s) => s.tilt != null && s.tilt <= 2);
  const tilted = sessions.filter((s) => s.tilt != null && s.tilt >= 4);
  if (calm.length >= 1 && tilted.length >= 1) {
    const gap = average(calm.map(sessionProfit)) - average(tilted.map(sessionProfit));
    if (gap > 0) {
      findings.push({
        id: 'tilt',
        severity: gap > (getMoneyUnit() === 'bb' ? 75 : 150) ? 'high' : 'medium', // $150 at $1/$2 = 75 bb
        title: 'Tilt is expensive',
        detail: `Tilted sessions average ${formatUnits(average(tilted.map(sessionProfit)), { whole: true })}, calm ones ${formatUnits(average(calm.map(sessionProfit)), { whole: true })}.`,
        action: 'When the tilt meter hits Frustrated, take a break or quit for the day.',
      });
    }
  }

  // Where and what you play: worst spot (if losing) and best spot.
  const groups = [
    { field: 'venue', words: (label) => `at ${label === 'Online' ? 'online tables' : label === 'Home game' ? 'home games' : 'the casino'}` },
    { field: 'stakes', words: (label) => `at ${label}` },
    { field: 'game', words: (label) => `in ${label}` },
  ];
  for (const { field, words } of groups) {
    const rows = hourlyBy(sessions, field);
    if (rows.length < 2) continue;
    const best = rows[0];
    const worst = rows[rows.length - 1];
    if (worst.value < 0) {
      findings.push({
        id: `${field}-worst`,
        severity: 'medium',
        title: `Losing ${words(worst.label)}`,
        detail: `You lose ${formatUnits(-worst.value, { sign: false, whole: true })}/h ${words(worst.label)}, while your best spot earns ${perHour(best.value)}.`,
        action: `Play more ${words(best.label)} and review your hands ${words(worst.label)}.`,
      });
    }
    if (best.value > 0) {
      findings.push({
        id: `${field}-best`,
        severity: 'strength',
        title: `Strong ${words(best.label)}`,
        detail: `Your best ${field}: ${perHour(best.value)} ${words(best.label)}.`,
        action: 'Keep this in your regular rotation.',
      });
    }
  }

  // Recent form: last five sessions vs. your overall average.
  if (sessions.length >= 8) {
    const recent = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const recentAvg = average(recent.map(sessionProfit));
    const overallAvg = average(sessions.map(sessionProfit));
    if (recentAvg < overallAvg - 60) {
      findings.push({
        id: 'form',
        severity: 'low',
        title: 'Recent downswing',
        detail: `Your last five sessions average ${formatUnits(recentAvg, { whole: true })} against ${formatUnits(overallAvg, { whole: true })} overall.`,
        action: 'Normal variance happens. Check your tilt ratings and keep sessions short until it turns.',
      });
    } else if (recentAvg > overallAvg + 60) {
      findings.push({
        id: 'form',
        severity: 'strength',
        title: 'On a heater',
        detail: `Your last five sessions average ${formatUnits(recentAvg, { whole: true })} against ${formatUnits(overallAvg, { whole: true })} overall.`,
        action: 'Enjoy it, but keep the same game selection and stop-loss discipline.',
      });
    }
  }

  // Leaks first; at most two strengths so they don't crowd out what needs work.
  const order = { high: 0, medium: 1, low: 2, strength: 3 };
  const sorted = findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const strengths = sorted.filter((f) => f.severity === 'strength').slice(0, 2);
  return [...sorted.filter((f) => f.severity !== 'strength'), ...strengths];
}
