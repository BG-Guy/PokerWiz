// Game History page: every session grouped by month, with game/venue filters and a summary row.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSessions } from '../../api/sessions.js';
import { getHands } from '../../api/hands.js';
import { useApi } from '../../hooks/useApi.js';
import { summarize, newestFirst, sessionProfit, cashGames, tournamentSummary } from '../../utils/stats.js';
import { formatMoney, formatMonth, formatUnits, sessionsForDisplay } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import StatCard from '../../components/StatCard/StatCard.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Money from '../../components/Money/Money.jsx';
import SessionRow from './SessionRow.jsx';
import './GameHistory.css';

const GAME_OPTIONS = [
  { value: 'all', label: 'All games' },
  { value: 'NLH', label: "No-Limit Hold'em" },
  { value: 'PLO', label: 'Pot-Limit Omaha' },
];
// Venue filters come from the sessions themselves (imports bring their own, like "Philly"), most played first.
function venueOptions(sessions) {
  const counts = new Map();
  for (const s of sessions) counts.set(s.venue, (counts.get(s.venue) ?? 0) + 1);
  const venues = [...counts].sort((a, b) => b[1] - a[1]).map(([venue]) => ({ value: venue, label: venue }));
  return [{ value: 'all', label: 'All venues' }, ...venues];
}

const loadHistory = () => Promise.all([getSessions(), getHands()]);

// Group sessions (already sorted newest first) into months, keeping that order.
function groupByMonth(list) {
  const groups = [];
  for (const session of list) {
    const key = session.date.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatMonth(session.date), sessions: [] };
      groups.push(group);
    }
    group.sessions.push(session);
  }
  return groups;
}

export default function GameHistory() {
  const [game, setGame] = useState('all');
  const [venue, setVenue] = useState('all');
  // A just-finished session arrives as ?open=<id> and starts expanded.
  const [searchParams] = useSearchParams();
  const [openId, setOpenId] = useState(searchParams.get('open'));
  const { data, error, reload } = useApi(loadHistory);

  if (!data) return <LoadState error={error} onRetry={reload} />;
  const [rawSessions, hands] = data;
  const sessions = sessionsForDisplay(rawSessions); // amounts in the BB/$ display unit

  // Apply filters, then compute the summary for exactly what is shown.
  const filtered = newestFirst(sessions).filter(
    (s) => (game === 'all' || s.game === game) && (venue === 'all' || s.venue === venue)
  );
  // Totals: big-blind numbers are for cash games; tournaments (no big blind) get their own line, in dollars.
  const summary = summarize(cashGames(filtered));
  const tournaments = tournamentSummary(filtered);
  const months = groupByMonth(filtered);

  return (
    <div className="game-history">
      <PageHeader title="Game History" subtitle="Every session you logged, newest first." />

      <div className="game-history-filters">
        <FilterChips options={GAME_OPTIONS} value={game} onChange={setGame} label="Filter by game" />
        <FilterChips options={venueOptions(rawSessions)} value={venue} onChange={setVenue} label="Filter by venue" />
      </div>

      {/* Totals for the current filter */}
      <div className="game-history-summary">
        <StatCard label="Sessions" value={summary.count} hint={`${summary.winning} winning`} />
        <StatCard label="Net" value={formatUnits(summary.net)} tone={summary.net >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Hours" value={summary.hours.toFixed(1)} hint={`${summary.hands.toLocaleString('en-US')} hands`} />
        <StatCard label="Hourly" value={`${formatUnits(summary.hourly, { whole: true })}/h`} />
      </div>
      {tournaments.count > 0 && (
        <p className="game-history-tournaments">
          These totals are cash games. Tournaments: {tournaments.count} played, {tournaments.cashes} cashed,{' '}
          <Money amount={tournaments.net} /> net.
        </p>
      )}

      {/* Month groups */}
      {months.map((month) => (
        <section key={month.key} className="game-history-month">
          <div className="game-history-month-head">
            <h2>{month.label}</h2>
            {/* Cash games in the BB/$ unit (tournament results are on their own rows, in dollars) */}
            <Money amount={cashGames(month.sessions).reduce((sum, s) => sum + sessionProfit(s), 0)} bb={1} />
          </div>
          <ul className="game-history-list">
            {month.sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                handCount={hands.filter((hand) => hand.sessionId === session.id).length}
                isOpen={openId === session.id}
                onToggle={() => setOpenId(openId === session.id ? null : session.id)}
              />
            ))}
          </ul>
        </section>
      ))}

      {filtered.length === 0 && <p className="game-history-empty">No sessions match these filters.</p>}
    </div>
  );
}
