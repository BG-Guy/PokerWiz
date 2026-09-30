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
// Values that are already converted for display (see sessionsForDisplay / handsForDisplay) use bb: 1.
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

// Sessions for totals and charts: in BB mode every money field is converted to big blinds (by that
// session's own big blind), so totals across different stakes add up correctly. Display only; never save these.
export function sessionsForDisplay(sessions) {
  if (moneyUnit !== 'bb') return sessions;
  return sessions.map((s) => {
    const bb = s.bigBlind > 0 ? s.bigBlind : 1;
    return {
      ...s,
      bigBlind: 1,
      buyIn: s.buyIn / bb,
      cashOut: s.cashOut == null ? s.cashOut : s.cashOut / bb,
      events: s.events?.map((e) => ({ ...e, amount: e.amount == null ? e.amount : e.amount / bb })),
    };
  });
}

// Hands for summaries (insights, highlights): the same conversion by each hand's stakes. Display only.
export function handsForDisplay(hands) {
  if (moneyUnit !== 'bb') return hands;
  return hands.map((h) => {
    const bb = bigBlindOf(h.stakes) ?? 1;
    const conv = (v) => (v == null ? v : v / bb);
    return {
      ...h,
      result: conv(h.result),
      potSize: conv(h.potSize),
      streets: h.streets?.map((st) => ({ ...st, pot: conv(st.pot), actions: st.actions.map((a) => ({ ...a, amount: conv(a.amount) })) })),
      players: h.players?.map((p) => ({ ...p, stack: conv(p.stack) })),
    };
  });
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
