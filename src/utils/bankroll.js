// Bankroll math for the chart, its full-screen view and the insight details: ordering, filters, the running
// curve, downswings, months, streaks and breakdowns. Pure functions; sessions come in already converted for
// display (sessionsForDisplay), so every amount is in the unit on screen.
import { sessionProfit, summarize } from './stats.js';
import { parseDate } from './format.js';

const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);
const isoOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Oldest first; sessions on the same day by start time.
export function chronological(sessions) {
  return [...sessions].sort((a, b) => `${a.date}${a.startedAt ?? ''}`.localeCompare(`${b.date}${b.startedAt ?? ''}`));
}

// Sessions inside a time range that ends today: 'all', 'year' (this calendar year), or a number of days ('90', '30').
export function inRange(sessions, range, today) {
  if (range === 'all') return sessions;
  if (range === 'year') return sessions.filter((s) => s.date.slice(0, 4) === today.slice(0, 4));
  const from = parseDate(today);
  from.setDate(from.getDate() - Number(range) + 1);
  const cutoff = isoOf(from);
  return sessions.filter((s) => s.date >= cutoff && s.date <= today);
}

// The full-screen chart's filters. format: 'cash' | 'tournament' (never mixed: cash is measured in big blinds,
// tournaments in dollars); game, stakes and venue: a value, or 'all'.
export function filterSessions(sessions, { range = 'all', format = 'cash', game = 'all', stakes = 'all', venue = 'all' } = {}, today) {
  const matches = (value, wanted) => wanted === 'all' || value === wanted;
  const picked = sessions.filter(
    (s) => (s.format ?? 'cash') === format && matches(s.game, game) && matches(s.stakes, stakes) && matches(s.venue, venue)
  );
  return inRange(picked, range, today);
}

// The values a field takes, most played first: [{ value, count }].
export function valuesOf(sessions, field) {
  const counts = new Map();
  for (const s of sessions) counts.set(s[field], (counts.get(s[field]) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

// The bankroll curve: a starting point at zero, then one point per session (running hours and running profit).
export function bankrollSeries(sessions) {
  const sorted = chronological(sessions);
  const points = [{ index: 0, hours: 0, bankroll: 0, date: sorted[0]?.date ?? null, session: null }];
  let hours = 0;
  let bankroll = 0;
  sorted.forEach((session, i) => {
    hours += session.durationMin / 60;
    bankroll += sessionProfit(session);
    points.push({ index: i + 1, hours, bankroll, date: session.date, session });
  });
  return points;
}

// Every downswing on the curve: from a peak (start) down to its lowest point (trough) and back up to the peak's
// level (end, or null while still under it). depth: peak minus trough. Biggest first.
export function downswings(points) {
  const list = [];
  let peak = 0;
  let current = null;
  for (let i = 1; i < points.length; i++) {
    const value = points[i].bankroll;
    if (value >= points[peak].bankroll) {
      if (current) list.push({ ...current, end: i });
      current = null;
      peak = i;
      continue;
    }
    const depth = points[peak].bankroll - value;
    if (!current) current = { start: peak, trough: i, end: null, depth };
    else if (depth > current.depth) current = { ...current, trough: i, depth };
  }
  if (current) list.push(current);
  return list.sort((a, b) => b.depth - a.depth);
}

// Where you stand against your best point: below = how far under the peak now (0 at a new high), plus the
// sessions and hours since that peak and the deepest point of the current stretch. null with no sessions.
export function currentDrawdown(points) {
  if (points.length < 2) return null;
  let peak = 0;
  for (let i = 1; i < points.length; i++) if (points[i].bankroll >= points[peak].bankroll) peak = i;
  const last = points[points.length - 1];
  const since = points.slice(peak);
  const lowest = Math.min(...since.map((p) => p.bankroll));
  return {
    below: points[peak].bankroll - last.bankroll,
    worst: points[peak].bankroll - lowest,
    peak: points[peak].bankroll,
    peakIndex: peak,
    peakDate: points[peak].session ? points[peak].date : null,
    sessions: last.index - points[peak].index,
    hours: last.hours - points[peak].hours,
  };
}

// Headline numbers for any slice of sessions: the stats.js summary plus best and worst session and the largest
// downswing inside the slice.
export function rangeSummary(sessions) {
  const points = bankrollSeries(sessions);
  const sorted = [...sessions].sort((a, b) => sessionProfit(b) - sessionProfit(a));
  const largest = downswings(points)[0] ?? null;
  return {
    ...summarize(sessions),
    biggestWin: sorted.length && sessionProfit(sorted[0]) > 0 ? sorted[0] : null,
    biggestLoss: sorted.length && sessionProfit(sorted.at(-1)) < 0 ? sorted.at(-1) : null,
    largestDownswing: largest ? { ...largest, points } : null,
  };
}

// Results per calendar month, oldest first: [{ month: 'YYYY-MM', net, hours, count, hourly, bbPer100, change }], where
// change is the difference from the month before it (null for the first month).
export function monthlyResults(sessions) {
  const months = new Map();
  for (const s of sessions) {
    const key = s.date.slice(0, 7);
    const m = months.get(key) ?? { month: key, net: 0, minutes: 0, count: 0, hands: 0, bigBlinds: 0 };
    m.net += sessionProfit(s);
    m.minutes += s.durationMin;
    m.count += 1;
    m.hands += s.hands ?? 0;
    m.bigBlinds += s.bigBlind > 0 ? sessionProfit(s) / s.bigBlind : 0;
    months.set(key, m);
  }
  const list = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  return list.map((m, i) => ({
    month: m.month,
    net: m.net,
    hours: m.minutes / 60,
    count: m.count,
    hourly: m.minutes > 0 ? m.net / (m.minutes / 60) : 0,
    bbPer100: m.hands > 0 ? (m.bigBlinds / m.hands) * 100 : 0,
    change: i ? m.net - list[i - 1].net : null,
  }));
}

// Month to month: the latest month you played against the one before it, with your best and worst months.
export function monthToMonth(sessions) {
  const months = monthlyResults(sessions);
  if (!months.length) return null;
  const byNet = [...months].sort((a, b) => b.net - a.net);
  return {
    months,
    latest: months.at(-1),
    previous: months.length > 1 ? months.at(-2) : null,
    best: byNet[0],
    worst: byNet.at(-1),
    winningMonths: months.filter((m) => m.net > 0).length,
  };
}

// Results grouped by a session field (stakes, venue, game), biggest net first.
export function breakdown(sessions, field) {
  const groups = new Map();
  for (const s of sessions) groups.set(s[field], [...(groups.get(s[field]) ?? []), s]);
  return [...groups.entries()]
    .map(([label, list]) => {
      const summary = summarize(list);
      return { label, net: summary.net, hours: summary.hours, count: summary.count, hourly: summary.hourly, bbPer100: summary.bbPer100, hands: summary.hands, winningShare: summary.winningShare };
    })
    .sort((a, b) => b.net - a.net);
}

// Results by session length: under 3 hours, 3 to 5, over 5 (only buckets you've played).
export function lengthBuckets(sessions) {
  const buckets = [
    { label: 'Under 3h', test: (m) => m < 180 },
    { label: '3h to 5h', test: (m) => m >= 180 && m <= 300 },
    { label: 'Over 5h', test: (m) => m > 300 },
  ];
  return buckets
    .map(({ label, test }) => {
      const list = sessions.filter((s) => test(s.durationMin));
      const summary = summarize(list);
      return { label, count: list.length, net: summary.net, hours: summary.hours, hourly: summary.hourly };
    })
    .filter((b) => b.count > 0);
}

// Winning and losing streaks (by session, oldest to newest), and the streak you're on now (+n wins / -n losses).
export function streaks(sessions) {
  let longestWin = 0;
  let longestLoss = 0;
  let current = 0;
  for (const s of chronological(sessions)) {
    const profit = sessionProfit(s);
    if (profit > 0) current = current > 0 ? current + 1 : 1;
    else if (profit < 0) current = current < 0 ? current - 1 : -1;
    else current = 0;
    longestWin = Math.max(longestWin, current);
    longestLoss = Math.max(longestLoss, -current);
  }
  return { longestWin, longestLoss, current };
}

// Average winning session and average losing session.
export function averageWinLoss(sessions) {
  const wins = sessions.map(sessionProfit).filter((p) => p > 0);
  const losses = sessions.map(sessionProfit).filter((p) => p < 0);
  return {
    averageWin: wins.length ? sum(wins, (p) => p) / wins.length : 0,
    averageLoss: losses.length ? sum(losses, (p) => p) / losses.length : 0,
  };
}

// Sessions per week across the span you've been playing (at least one week).
export function sessionsPerWeek(sessions) {
  if (!sessions.length) return 0;
  const sorted = chronological(sessions);
  const days = (parseDate(sorted.at(-1).date) - parseDate(sorted[0].date)) / 86400000 + 1;
  return sessions.length / Math.max(1, days / 7);
}
