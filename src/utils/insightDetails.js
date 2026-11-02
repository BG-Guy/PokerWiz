// The detailed view behind each stat and insight card (tap on phones, click on desktop): a lead number, a few
// facts, and sections such as month-by-month bars, breakdowns by stakes / venue / game, a small curve or a
// list. Pure: builds plain data that the StatDetail component draws. Sessions come in as cash games converted
// for display.
import { summarize, sessionProfit } from './stats.js';
import { amountFormatters, formatDate } from './format.js';
import {
  bankrollSeries,
  breakdown,
  chronological,
  downswings,
  lengthBuckets,
  monthToMonth,
  monthlyResults,
  streaks,
  averageWinLoss,
  sessionsPerWeek,
} from './bankroll.js';
import { downswingStatus, varianceCheck, MIN_HOURS, MIN_SESSIONS } from './sessionInsights.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 'YYYY-MM' -> "Oct" / "October 2026"
export const shortMonth = (key) => MONTHS[Number(key.slice(5, 7)) - 1];
export const longMonth = (key) => `${LONG_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

const tone = (value) => (value > 0 ? 'positive' : value < 0 ? 'negative' : undefined);
const hoursText = (h) => `${Math.round(h).toLocaleString('en-US')}h`;
const pct = (share) => `${Math.round(share * 100)}%`;
const sessionsText = (n) => `${n} session${n === 1 ? '' : 's'}`;
const GROUPS = [
  { key: 'stakes', label: 'Stakes' },
  { key: 'venue', label: 'Venue' },
  { key: 'game', label: 'Game' },
];
// Months on the bar chart: the last year at most.
const recentMonths = (sessions) => monthlyResults(sessions).slice(-12);

// Breakdown section: one tab per field (only fields with more than one value), rows built by `row`.
function breakdownSection(title, sessions, row, sortBy = 'net') {
  const groups = GROUPS.map(({ key, label }) => ({
    key,
    label,
    items: breakdown(sessions, key)
      .sort((a, b) => b[sortBy] - a[sortBy])
      .map(row),
  })).filter((g) => g.items.length > 1);
  return groups.length ? { type: 'breakdown', title, groups } : null;
}

// Bars per month: value picks the number, display formats it.
function monthsSection(title, sessions, value, display, signed = true) {
  const months = recentMonths(sessions);
  if (months.length < 2) return null;
  return {
    type: 'bars',
    title,
    signed,
    items: months.map((m) => ({ key: m.month, label: shortMonth(m.month), value: value(m), display: display(value(m)), title: longMonth(m.month) })),
  };
}

function netDetail(sessions, money) {
  const s = summarize(sessions);
  const points = bankrollSeries(sessions);
  const sorted = [...sessions].sort((a, b) => sessionProfit(b) - sessionProfit(a));
  const { averageWin, averageLoss } = averageWinLoss(sessions);
  return {
    lead: { value: money.full(s.net), tone: tone(s.net), caption: `${sessionsText(s.count)}, ${hoursText(s.hours)} at the tables` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Best session', value: money.full(sessionProfit(sorted[0])), tone: tone(sessionProfit(sorted[0])), hint: formatDate(sorted[0].date) },
          { label: 'Worst session', value: money.full(sessionProfit(sorted.at(-1))), tone: tone(sessionProfit(sorted.at(-1))), hint: formatDate(sorted.at(-1).date) },
          { label: 'Average win', value: money.full(averageWin), tone: tone(averageWin) },
          { label: 'Average loss', value: money.full(averageLoss), tone: tone(averageLoss) },
        ],
      },
      points.length > 2 && { type: 'curve', title: 'Your bankroll', data: points.map((p) => ({ label: p.date ?? '', value: p.bankroll })), tone: 'neutral' },
      monthsSection('Month by month', sessions, (m) => m.net, (v) => money.full(v)),
      breakdownSection('Where it comes from', sessions, (r) => ({ label: r.label, value: r.net, display: money.full(r.net), hint: `${sessionsText(r.count)} · ${money.full(r.hourly)}/h` })),
    ],
  };
}

function hourlyDetail(sessions, money) {
  const s = summarize(sessions);
  const recent = summarize(chronological(sessions).slice(-10));
  return {
    lead: { value: `${money.full(s.hourly)}/h`, tone: tone(s.hourly), caption: `over ${hoursText(s.hours)} of play` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Last 10 sessions', value: `${money.full(recent.hourly)}/h`, tone: tone(recent.hourly), hint: `${hoursText(recent.hours)} played` },
          { label: 'Average session', value: `${(s.hours / Math.max(1, s.count)).toFixed(1)}h` },
        ],
      },
      monthsSection('Hourly by month', sessions, (m) => m.hourly, (v) => `${money.full(v)}/h`),
      breakdownSection('Hourly by', sessions, (r) => ({ label: r.label, value: r.hourly, display: `${money.full(r.hourly)}/h`, hint: `${hoursText(r.hours)} · ${sessionsText(r.count)}` }), 'hourly'),
      lengthSection(sessions, money),
    ],
  };
}

// Hourly by session length: shows whether long sessions are paying off.
function lengthSection(sessions, money) {
  const buckets = lengthBuckets(sessions);
  if (buckets.length < 2) return null;
  return {
    type: 'list',
    title: 'By session length',
    items: buckets.map((b) => ({ label: b.label, value: `${money.full(b.hourly)}/h`, tone: tone(b.hourly), hint: `${sessionsText(b.count)} · ${money.full(b.net)}` })),
  };
}

function winRateDetail(sessions) {
  const s = summarize(sessions);
  const bb100 = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
  return {
    lead: { value: `${s.bbPer100.toFixed(1)} bb/100`, tone: tone(s.bbPer100), caption: `over ${s.hands.toLocaleString('en-US')} hands` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Hands', value: s.hands.toLocaleString('en-US') },
          { label: 'Hands an hour', value: s.hours ? Math.round(s.hands / s.hours).toString() : '0' },
        ],
      },
      monthsSection('bb/100 by month', sessions, (m) => m.bbPer100, bb100),
      breakdownSection('bb/100 by', sessions, (r) => ({ label: r.label, value: r.bbPer100, display: `${bb100(r.bbPer100)}`, hint: `${r.hands.toLocaleString('en-US')} hands` }), 'bbPer100'),
      {
        type: 'text',
        title: 'Reading it',
        paragraphs: [
          s.hands < 30000
            ? `Win rates take tens of thousands of hands to settle. At ${s.hands.toLocaleString('en-US')} hands, treat this as a rough guide, not a verdict.`
            : `${s.hands.toLocaleString('en-US')} hands is a solid sample: this number means something.`,
        ],
      },
    ],
  };
}

function winningDetail(sessions, money) {
  const s = summarize(sessions);
  const { averageWin, averageLoss } = averageWinLoss(sessions);
  const streak = streaks(sessions);
  const current = streak.current > 0 ? `${streak.current} won` : streak.current < 0 ? `${-streak.current} lost` : 'Even';
  return {
    lead: { value: pct(s.winningShare), caption: `${s.winning} of ${sessionsText(s.count)} were winners` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Average win', value: money.full(averageWin), tone: tone(averageWin) },
          { label: 'Average loss', value: money.full(averageLoss), tone: tone(averageLoss) },
          { label: 'Longest winning run', value: sessionsText(streak.longestWin) },
          { label: 'Longest losing run', value: sessionsText(streak.longestLoss) },
          { label: 'Right now', value: current, hint: 'in a row' },
        ],
      },
      monthsSection('Winning sessions by month', sessions, (m) => {
        const list = sessions.filter((x) => x.date.startsWith(m.month));
        return list.filter((x) => sessionProfit(x) > 0).length / list.length;
      }, pct, false),
      breakdownSection('Winning sessions by', sessions, (r) => ({ label: r.label, value: r.winningShare, display: pct(r.winningShare), hint: sessionsText(r.count) }), 'winningShare'),
    ],
  };
}

function downswingDetail(sessions, money) {
  const status = downswingStatus(sessions);
  const points = bankrollSeries(sessions);
  const biggest = downswings(points).slice(0, 3);
  const dateOf = (i) => (points[i].session ? formatDate(points[i].date) : 'the start');
  const lead = status.inDownswing
    ? { value: money.full(-status.below), tone: 'negative', caption: `below your peak, ${sessionsText(status.sessions)} and ${hoursText(status.hours)} in` }
    : { value: 'At your peak', tone: 'positive', caption: status.below > 0 ? `just ${money.full(status.below, { sign: false })} under your best` : 'your bankroll is at its best' };
  return {
    lead,
    sections: [
      status.inDownswing && {
        type: 'facts',
        items: [
          { label: 'Below peak now', value: money.full(-status.below), tone: 'negative' },
          { label: 'Deepest point', value: money.full(-status.worst), tone: 'negative' },
          { label: 'Sessions since peak', value: String(status.sessions) },
          { label: 'Hours since peak', value: hoursText(status.hours) },
          { label: 'Peak', value: money.full(status.peak), hint: status.peakDate ? formatDate(status.peakDate) : 'at the start' },
        ],
      },
      status.inDownswing &&
        status.sessions > 1 && {
          type: 'curve',
          title: 'Since your peak',
          data: points.slice(status.peakIndex).map((p) => ({ label: p.date ?? '', value: p.bankroll - status.peak })),
          tone: 'negative',
        },
      biggest.length > 0 && {
        type: 'list',
        title: 'Your biggest downswings',
        items: biggest.map((d) => {
          const length = (d.end ?? points.length - 1) - d.start;
          return {
            label: `${dateOf(d.start)} to ${d.end !== null ? dateOf(d.end) : 'now'}`,
            value: money.full(-d.depth),
            tone: 'negative',
            hint: d.end !== null ? `${sessionsText(length)}, recovered` : `${sessionsText(length)}, still climbing back`,
          };
        }),
      },
    ],
  };
}

function monthsDetail(sessions, money) {
  const m = monthToMonth(sessions);
  const average = m.months.reduce((total, x) => total + x.net, 0) / m.months.length;
  return {
    lead: { value: money.full(m.latest.net), tone: tone(m.latest.net), caption: longMonth(m.latest.month) },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Best month', value: money.full(m.best.net), tone: tone(m.best.net), hint: longMonth(m.best.month) },
          { label: 'Worst month', value: money.full(m.worst.net), tone: tone(m.worst.net), hint: longMonth(m.worst.month) },
          { label: 'Winning months', value: `${m.winningMonths} of ${m.months.length}` },
          { label: 'Average month', value: money.full(average), tone: tone(average) },
        ],
      },
      monthsSection('Month by month', sessions, (x) => x.net, (v) => money.full(v)),
      {
        type: 'list',
        title: 'Every month',
        items: [...m.months].reverse().map((x) => ({
          label: longMonth(x.month),
          value: money.full(x.net),
          tone: tone(x.net),
          hint: `${sessionsText(x.count)} · ${hoursText(x.hours)} · ${money.full(x.hourly)}/h${x.change !== null ? ` · ${money.full(x.change)} vs ${shortMonth(previousKey(x.month))}` : ''}`,
        })),
      },
    ],
  };
}
const previousKey = (key) => {
  const [y, mo] = key.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};

function sessionsDetail(sessions, money) {
  const s = summarize(sessions);
  return {
    lead: { value: s.count.toLocaleString('en-US'), caption: `about ${sessionsPerWeek(sessions).toFixed(1)} a week` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Average length', value: `${(s.hours / Math.max(1, s.count)).toFixed(1)}h` },
          { label: 'Winning', value: pct(s.winningShare), hint: `${s.winning} of ${s.count}` },
          { label: 'Average result', value: money.full(s.net / Math.max(1, s.count)), tone: tone(s.net) },
        ],
      },
      monthsSection('Sessions by month', sessions, (m) => m.count, String, false),
      breakdownSection('Where you play', sessions, (r) => ({ label: r.label, value: r.count, display: String(r.count), hint: `${pct(r.count / s.count)} · ${money.full(r.net)}` }), 'count'),
    ],
  };
}

function hoursDetail(sessions, money) {
  const s = summarize(sessions);
  const longest = Math.max(...sessions.map((x) => x.durationMin)) / 60;
  return {
    lead: { value: hoursText(s.hours), caption: `${(s.hours / Math.max(1, s.count)).toFixed(1)}h a session on average` },
    sections: [
      {
        type: 'facts',
        items: [
          { label: 'Hourly', value: `${money.full(s.hourly)}/h`, tone: tone(s.hourly) },
          { label: 'Longest session', value: `${longest.toFixed(1)}h` },
          { label: 'Hands', value: s.hands.toLocaleString('en-US') },
        ],
      },
      monthsSection('Hours by month', sessions, (m) => m.hours, (v) => `${Math.round(v)}h`, false),
      lengthSection(sessions, money),
    ],
  };
}

function normalDetail(sessions, money) {
  const check = varianceCheck(sessions);
  if (check.status === 'not-enough') {
    return {
      lead: { value: check.label, caption: 'not enough sessions yet' },
      sections: [
        { type: 'text', title: 'What it needs', paragraphs: [check.sentence, `So far: ${sessionsText(sessions.length)}. To go: ${check.sessionsNeeded} more sessions, ${check.hoursNeeded} more hours.`] },
        methodSection(),
      ],
    };
  }
  const yours = [
    { label: 'Your win rate', value: `${money.full(check.winRate)}/h`, tone: tone(check.winRate) },
    { label: 'Your swings', value: `${money.full(check.sd, { sign: false })}/h`, hint: 'standard deviation' },
    { label: 'Hours played', value: hoursText(check.hours) },
  ];
  if (check.status === 'none') {
    return { lead: { value: check.label, caption: 'no real downswing yet' }, sections: [{ type: 'facts', items: yours }, { type: 'text', paragraphs: [check.sentence] }, methodSection()] };
  }
  return {
    lead: { value: check.label, tone: check.status === 'unusual' ? 'negative' : undefined, caption: check.sentence },
    sections: [
      {
        type: 'facts',
        items: [
          { label: check.which === 'current' ? 'Your downswing' : 'Your biggest downswing', value: money.full(-check.depth), tone: 'negative' },
          { label: 'Players who see one this deep', value: `${Math.round(check.chance * 100)}%`, hint: `of ${check.runs.toLocaleString('en-US')} simulated` },
          ...yours,
          { label: 'Typical worst downswing', value: money.full(-check.typicalWorst), hint: `for your numbers over ${hoursText(check.hours)}` },
          { label: 'A rough stretch', value: money.full(-check.roughWorst), hint: '1 player in 10 sees one this deep' },
        ],
      },
      { type: 'text', title: 'What it means', paragraphs: check.meaning },
      methodSection(),
    ],
  };
}

// How the check works, in plain words.
function methodSection() {
  return {
    type: 'text',
    title: 'How this is worked out',
    paragraphs: [
      'Your win rate per hour and how much your results swing per hour (the standard deviation) come from your own cash sessions, with longer sessions counting for more.',
      `We then play out 2,000 imaginary players with exactly those numbers over the same number of hours, as a random walk that drifts up (or down) at your win rate, and count how many of them hit a downswing at least as deep as yours. It needs at least ${MIN_SESSIONS} sessions and ${MIN_HOURS} hours.`,
      "It's an estimate, not a diagnosis: it assumes your win rate is what your results say, and real win rates take a lot of hours to pin down.",
    ],
  };
}

const BUILDERS = {
  net: ['Net profit', netDetail],
  hourly: ['Hourly', hourlyDetail],
  winrate: ['Win rate', winRateDetail],
  winning: ['Winning sessions', winningDetail],
  downswing: ['Downswing', downswingDetail],
  months: ['Month to month', monthsDetail],
  sessions: ['Sessions', sessionsDetail],
  hours: ['Hours', hoursDetail],
  normal: ['Is it normal?', normalDetail],
};

// The detail for one card: { title, lead: { value, tone, caption }, sections: [...] }, or null without sessions.
export function statDetail(kind, sessions) {
  if (!sessions.length || !BUILDERS[kind]) return null;
  const [title, build] = BUILDERS[kind];
  const detail = build(sessions, amountFormatters());
  return { title, ...detail, sections: detail.sections.filter(Boolean) };
}
