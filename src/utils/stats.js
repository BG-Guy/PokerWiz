// Session math: profit, win rates, grouping and the bankroll curve. Big-blind numbers (bb/100, the BB display
// unit, hourly rates) are cash-game numbers: tournaments have no big blind and get their own summary.

// Net result of one session in dollars: cash-out minus buy-in and expenses (tips, food, fees).
export function sessionProfit(session) {
  return session.cashOut - session.buyIn - (session.expenses ?? 0);
}

export const isTournament = (session) => session.format === 'tournament';

// Cash-game sessions only (what the dashboard, history totals, insights and the bankroll chart measure).
export const cashGames = (sessions) => sessions.filter((s) => !isTournament(s));

// Tournament results in dollars: entries, total buy-ins (with expenses), cashes, net and ROI.
export function tournamentSummary(sessions) {
  const list = sessions.filter(isTournament);
  const spent = list.reduce((sum, s) => sum + s.buyIn + (s.expenses ?? 0), 0);
  const net = list.reduce((sum, s) => sum + sessionProfit(s), 0);
  return {
    count: list.length,
    spent,
    net,
    cashes: list.filter((s) => s.cashOut > 0).length,
    roi: spent > 0 ? net / spent : 0,
    hours: list.reduce((sum, s) => sum + s.durationMin, 0) / 60,
  };
}

// Headline numbers for a list of sessions (cash games: pass cashGames(sessions) when tournaments may be in).
export function summarize(sessions) {
  const net = sessions.reduce((sum, s) => sum + sessionProfit(s), 0);
  const minutes = sessions.reduce((sum, s) => sum + s.durationMin, 0);
  const hands = sessions.reduce((sum, s) => sum + s.hands, 0);
  const bigBlindsWon = sessions.reduce((sum, s) => sum + (s.bigBlind > 0 ? sessionProfit(s) / s.bigBlind : 0), 0);
  const winning = sessions.filter((s) => sessionProfit(s) > 0).length;
  const hours = minutes / 60;

  return {
    count: sessions.length,
    net,
    hours,
    hands,
    hourly: hours > 0 ? net / hours : 0,
    bbPer100: hands > 0 ? (bigBlindsWon / hands) * 100 : 0,
    winning,
    winningShare: sessions.length > 0 ? winning / sessions.length : 0,
  };
}

// Sessions sorted newest first (without mutating the input).
export function newestFirst(sessions) {
  return [...sessions].sort((a, b) => b.date.localeCompare(a.date));
}

// Running total of profit over time, oldest first, for the bankroll chart.
export function cumulativeProfit(sessions) {
  let total = 0;
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      total += sessionProfit(s);
      return { label: s.date, value: total };
    });
}

// Hourly win rate grouped by a session field (e.g. "venue" or "game"), best first.
export function hourlyBy(sessions, field) {
  const groups = new Map();
  for (const s of sessions) {
    const group = groups.get(s[field]) ?? { net: 0, minutes: 0 };
    group.net += sessionProfit(s);
    group.minutes += s.durationMin;
    groups.set(s[field], group);
  }
  return [...groups.entries()]
    .map(([label, g]) => ({ label, value: g.net / (g.minutes / 60) }))
    .sort((a, b) => b.value - a.value);
}

// Compare average results of long sessions vs. short ones (the "stop earlier" insight).
export function sessionLengthSplit(sessions, cutoffMin = 300) {
  const average = (list) => (list.length ? list.reduce((sum, s) => sum + sessionProfit(s), 0) / list.length : 0);
  const long = sessions.filter((s) => s.durationMin > cutoffMin);
  const short = sessions.filter((s) => s.durationMin <= cutoffMin);
  return { cutoffMin, longAvg: average(long), shortAvg: average(short), longCount: long.length, shortCount: short.length };
}
