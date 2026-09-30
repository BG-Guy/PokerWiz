// Formatting helpers for money, dates, durations and goal values.

// "+$120" / "-$45" by default; pass { sign: false } for a plain "$120".
export function formatMoney(amount, { sign = true } = {}) {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  const text = `$${rounded.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  if (!sign || amount === 0) return text;
  return `${amount > 0 ? '+' : '-'}${text}`;
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
