// Summary of the sessions on the full-screen chart: net result up top, then win rate, hourly, volume, the best
// and worst session and the largest downswing in the range.
import { formatDate } from '../../utils/format.js';
import { sessionProfit } from '../../utils/stats.js';
import './BankrollSummary.css';

const tone = (value) => (value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : '');

// summary: rangeSummary(). money: amountFormatters(). dollars: tournaments (no big blind, so no bb/100).
export default function BankrollSummary({ summary, money, dollars }) {
  const perHour = `${money.full(summary.hourly)}/h`;
  const rows = [
    !dollars && { label: 'Win rate', value: `${summary.bbPer100.toFixed(1)} bb/100`, tone: tone(summary.bbPer100) },
    { label: 'Hourly', value: perHour, tone: tone(summary.hourly) },
    { label: 'Sessions', value: summary.count.toLocaleString('en-US'), hint: `${Math.round(summary.winningShare * 100)}% winning` },
    { label: 'Hours', value: Math.round(summary.hours).toLocaleString('en-US'), hint: summary.count ? `${(summary.hours / summary.count).toFixed(1)}h a session` : '' },
    summary.biggestWin && { label: 'Best session', value: money.full(sessionProfit(summary.biggestWin)), tone: 'is-positive', hint: formatDate(summary.biggestWin.date) },
    summary.biggestLoss && { label: 'Worst session', value: money.full(sessionProfit(summary.biggestLoss)), tone: 'is-negative', hint: formatDate(summary.biggestLoss.date) },
    summary.largestDownswing && {
      label: 'Largest downswing',
      value: money.full(-summary.largestDownswing.depth),
      tone: 'is-negative',
      hint: downswingHint(summary.largestDownswing),
    },
  ].filter(Boolean);

  return (
    <section className="bankroll-summary" aria-label="Summary of the sessions on the chart">
      <div className="bankroll-summary-net">
        <span className="bankroll-summary-label">Net result</span>
        <span className={`bankroll-summary-net-value num ${tone(summary.net)}`}>{money.full(summary.net)}</span>
      </div>
      <dl className="bankroll-summary-grid">
        {rows.map((row) => (
          <div key={row.label} className="bankroll-summary-item">
            <dt className="bankroll-summary-label">{row.label}</dt>
            <dd className={`bankroll-summary-value num ${row.tone ?? ''}`}>{row.value}</dd>
            {row.hint && <dd className="bankroll-summary-hint">{row.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

// "12 sessions, recovered" / "8 sessions so far"
function downswingHint({ start, trough, end, points }) {
  const length = (end ?? points.length - 1) - start;
  const words = `${length} session${length === 1 ? '' : 's'}`;
  if (end !== null) return `${words}, recovered`;
  return trough === points.length - 1 ? `${words}, still in it` : `${words} so far`;
}
