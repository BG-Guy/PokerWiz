// Formatting helpers for money, dates, durations and goal values.

// Money can be shown in big blinds (the default) or dollars. The unit is app-wide (see theme/UnitContext.jsx);
// in the worker the coach sets it from the request.
let moneyUnit = 'bb';
export function setMoneyUnit(unit) {
  moneyUnit = unit === '$' ? '$' : 'bb';
}
export function getMoneyUnit() {
  return moneyUnit;
}

// An amount in the current unit. bb = the big blind it's measured against: "+12.5 bb" in BB mode,
// "+$25" in dollar mode. Without a bb (nothing to measure against) it stays in dollars.
// Values that are already converted for display (see moneyScope / handsForDisplay) use bb: 1.
// Pass { sign: false } for a plain amount.
export function formatMoney(amount, { sign = true, bb = null } = {}) {
  if (moneyUnit === 'bb' && bb > 0) return withSign(amount, formatBB(Math.abs(amount) / bb), sign);
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return withSign(amount, `$${rounded.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`, sign);
}

// "12.5 bb"; one decimal below 100 bb, whole numbers above.
function formatBB(value) {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  // Plain String() below 1,000 (no separators needed, and far cheaper: labels are built in hot loops).
  return `${rounded < 1000 ? String(rounded) : rounded.toLocaleString('en-US', { maximumFractionDigits: 1 })} bb`;
}

function withSign(amount, text, sign) {
  if (!sign || Math.abs(amount) < 1e-9) return text;
  return `${amount > 0 ? '+' : '-'}${text}`;
}

// A value that's already in the display unit (converted data, or totals computed from it).
// { whole: true } rounds dollars to whole dollars (big blinds keep one decimal).
export function formatUnits(value, { whole = false, ...options } = {}) {
  return formatMoney(whole && moneyUnit === '$' ? Math.round(value) : value, { ...options, bb: 1 });
}

// Big blind from a stakes label: "$1/$2" -> 2, "1/2 + ante" -> 2. null if it can't be read.
export function bigBlindOf(stakesLabel) {
  const parsed = /\$?([\d.]+)\s*\/\s*\$?([\d.]+)/.exec(stakesLabel ?? '');
  return parsed ? Number(parsed[2]) : null;
}

// The one big blind a list of them shares, or null when they differ (or one is missing, as for a tournament).
export function sharedBigBlind(bigBlinds) {
  let shared = null;
  for (const bb of bigBlinds) {
    if (!(bb > 0) || (shared !== null && bb !== shared)) return null;
    shared = bb;
  }
  return shared;
}

// One session with every money field in big blinds (its own). Display only; never save these.
function sessionInBigBlinds(s) {
  const bb = s.bigBlind;
  return {
    ...s,
    bigBlind: 1,
    buyIn: s.buyIn / bb,
    expenses: (s.expenses ?? 0) / bb,
    cashOut: s.cashOut == null ? s.cashOut : s.cashOut / bb,
    events: s.events?.map((e) => ({ ...e, amount: e.amount == null ? e.amount : e.amount / bb })),
  };
}

// One hand with every amount in big blinds (by its stakes). Display only.
function handInBigBlinds(h) {
  const bb = bigBlindOf(h.stakes) ?? 1;
  const conv = (v) => (v == null ? v : v / bb);
  return {
    ...h,
    result: conv(h.result),
    potSize: conv(h.potSize),
    streets: h.streets?.map((st) => ({ ...st, pot: conv(st.pot), actions: st.actions.map((a) => ({ ...a, amount: conv(a.amount) })) })),
    players: h.players?.map((p) => ({ ...p, stack: conv(p.stack) })),
  };
}

// What a total, an average or a curve over several sessions or hands is shown in. Big blinds only add up when
// they are the same size (+300 bb at $1/$2 and -100 bb at $5/$10 is a $400 loss, not "+200 bb"), so a group
// is in big blinds only when the BB/$ switch says so and everything in it was played at one big blind;
// otherwise it's in dollars, and `mixed` says the switch was overruled (UnitNote explains it on screen).
//   inBB    the group is shown in big blinds
//   mixed   the switch asks for big blinds, but these were played at different ones
//   money   amountFormatters() for the group's unit
//   bb      for <Money bb>: 1 when the amounts are already in big blinds, null for dollars
//   stakes  the stakes in the group, most played first
function scopeOf(bigBlinds, stakes) {
  const inBB = moneyUnit === 'bb' && bigBlinds.length > 0 && sharedBigBlind(bigBlinds) !== null;
  const counts = new Map();
  for (const label of stakes) if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  return {
    inBB,
    mixed: moneyUnit === 'bb' && !inBB && new Set(bigBlinds.filter((bb) => bb > 0)).size > 1,
    money: amountFormatters({ dollars: !inBB }),
    bb: inBB ? 1 : null,
    stakes: [...counts].sort((a, b) => b[1] - a[1]).map(([label]) => label),
  };
}

// Why a group is in dollars although the BB/$ switch is on big blinds, in a sentence; null when it isn't overruled.
// tip: what to do about it there ("Pick one stake to see big blinds."), which replaces the explanation.
export function mixedStakesNote(scope, tip = null) {
  if (!scope?.mixed) return null;
  if (tip) return `In dollars: these mix different blinds. ${tip}`;
  const stakes = scope.stakes.slice(0, 3).join(', ') + (scope.stakes.length > 3 ? ' and more' : '');
  return `In dollars, because these were played at different blinds (${stakes}): big blinds of different sizes don't add up.`;
}

// Sessions for totals and charts: { sessions, ...scope }, the sessions converted to big blinds when the group
// can be shown in them (see scopeOf). A row about one session doesn't need this: format it by its own big blind.
export function moneyScope(sessions) {
  const scope = scopeOf(sessions.map((s) => s.bigBlind), sessions.map((s) => s.stakes));
  return { ...scope, sessions: scope.inBB ? sessions.map(sessionInBigBlinds) : sessions };
}

// Hands for totals (hand insights): { hands, ...scope }, by the same rule.
export function handScope(hands) {
  const scope = scopeOf(hands.map((h) => bigBlindOf(h.stakes)), hands.map((h) => h.stakes));
  return { ...scope, hands: scope.inBB ? hands.map(handInBigBlinds) : hands };
}

// Hands for lines about one hand each (highlights): every hand converted by its own stakes. Display only.
export function handsForDisplay(hands) {
  return moneyUnit === 'bb' ? hands.map(handInBigBlinds) : hands;
}

// Parse a YYYY-MM-DD string as a local calendar date (avoids timezone shifts).
export function parseDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// "Sep 27"
export function formatDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Sep 27, 2026"
export function formatLongDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "1 session", "12 sessions", "1,204 hands" (many: the plural when it isn't just an added "s").
export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

// "September 2026"
export function formatMonth(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// "Sat"
export function formatWeekday(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

// 285 -> "4h 45m"
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Whole days between two ISO dates.
export function daysBetween(fromIso, toIso) {
  return Math.round((parseDate(toIso) - parseDate(fromIso)) / 86400000);
}

// Show a goal value in its unit: "$1,298", "27%", "11,850 hands".
export function formatGoalValue(value, unit) {
  if (unit === '$') return formatMoney(Math.round(value), { sign: false });
  if (unit === '%') return `${Math.round(value * 10) / 10}%`;
  return `${Math.round(value).toLocaleString('en-US')} ${unit}`;
}

// Today's local date as YYYY-MM-DD.
export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Elapsed milliseconds as a running clock: "1:05:09".
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// Time of day from an ISO timestamp: "8:14 PM".
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Amount formatters for a chart: full ("+312 bb", "+$1,240") and compact axis labels ("1.2k bb", "$1.2k").
// dollars: true for tournament results, which have no big blind and always show in dollars.
export function amountFormatters({ dollars = false } = {}) {
  const inBB = !dollars && moneyUnit === 'bb';
  const full = (value, { sign = true } = {}) =>
    dollars ? formatMoney(Math.round(value), { sign }) : formatUnits(value, { whole: true, sign });
  const compact = (value) => {
    const minus = value < 0 ? '-' : '';
    if (Math.abs(value) < 1000) return `${minus}${full(Math.abs(value), { sign: false })}`;
    // 1,250 is "1.25k" (an axis tick must not read as 1.3k); bigger numbers need fewer decimals.
    const thousands = Math.abs(value) / 1000;
    const k = `${Number(thousands.toFixed(thousands >= 100 ? 0 : thousands >= 10 ? 1 : 2))}k`;
    return inBB ? `${minus}${k} bb` : `${minus}$${k}`;
  };
  return { full, compact, unit: inBB ? 'bb' : '$' };
}
