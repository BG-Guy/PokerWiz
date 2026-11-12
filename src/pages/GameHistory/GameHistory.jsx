// Game History page: every session grouped by month, with game / stakes / venue filters and a summary row. The
// summary boxes and each month's total open their story in a sheet. Totals are in big blinds only when the
// sessions shown share one big blind (pick one stake to get there); each session's own row always can be.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSessions } from '../../api/sessions.js';
import { getHands } from '../../api/hands.js';
import { useApi } from '../../hooks/useApi.js';
import { useDetailView } from '../../hooks/useDetailView.js';
import { useUnit } from '../../theme/UnitContext.jsx';
import { summarize, newestFirst, sessionProfit, cashGames, tournamentSummary } from '../../utils/stats.js';
import { monthDetail, statDetail } from '../../utils/insightDetails.js';
import { formatMonth, moneyScope } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import StatCard from '../../components/StatCard/StatCard.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Money from '../../components/Money/Money.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import DetailSheet from '../../components/DetailSheet/DetailSheet.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import UnitNote from '../../components/UnitNote/UnitNote.jsx';
import SessionRow from './SessionRow.jsx';
import './GameHistory.css';

const GAME_OPTIONS = [
  { value: 'all', label: 'All games' },
  { value: 'NLH', label: "No-Limit Hold'em" },
  { value: 'PLO', label: 'Pot-Limit Omaha' },
];
// Stakes and venue filters come from the sessions themselves (imports bring their own, like "Philly"), most
// played first.
function optionsOf(sessions, field, allLabel) {
  const counts = new Map();
  for (const s of sessions) if (s[field]) counts.set(s[field], (counts.get(s[field]) ?? 0) + 1);
  const values = [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => ({ value, label: value }));
  return [{ value: 'all', label: allLabel }, ...values];
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
  const [stakes, setStakes] = useState('all');
  const [venue, setVenue] = useState('all');
  // A just-finished session arrives as ?open=<id> and starts expanded.
  const [searchParams] = useSearchParams();
  const [openId, setOpenId] = useState(searchParams.get('open'));
  const { data, error, reload, setData } = useApi(loadHistory);
  const detail = useDetailView();
  useUnit(); // the totals below follow the BB/$ switch

  if (!data) return <LoadState error={error} onRetry={reload} />;
  const [sessions, hands] = data;

  // Apply filters, then compute the summary for exactly what is shown.
  const filtered = newestFirst(sessions).filter(
    (s) => (game === 'all' || s.game === game) && (stakes === 'all' || s.stakes === stakes) && (venue === 'all' || s.venue === venue)
  );
  // Totals: cash games, in the unit they can be added up in; tournaments (no big blind) get their own line, in dollars.
  const scope = moneyScope(cashGames(filtered));
  const { money } = scope;
  const summary = summarize(scope.sessions);
  const tournaments = tournamentSummary(filtered);
  const months = groupByMonth(filtered);
  const monthNet = (key) => scope.sessions.filter((s) => s.date.startsWith(key)).reduce((sum, s) => sum + sessionProfit(s), 0);
  const stakesOptions = optionsOf(cashGames(sessions), 'stakes', 'All stakes');

  // What the open sheet shows: the story behind a summary box, or one month.
  const key = detail.shownKey;
  const shownDetail = !key ? null : key.startsWith('month:') ? monthDetail(key.slice(6), scope) : statDetail(key, scope);

  // After an edit: swap in the saved session. After a delete: drop it (its hands stay, without a session).
  const replaceSession = (saved) => setData(([list, allHands]) => [list.map((s) => (s.id === saved.id ? saved : s)), allHands]);
  const removeSession = (id) => {
    setOpenId(null);
    setData(([list, allHands]) => [
      list.filter((s) => s.id !== id),
      allHands.map((hand) => (hand.sessionId === id ? { ...hand, sessionId: null } : hand)),
    ]);
  };
  const cards = [
    { id: 'sessions', label: 'Sessions', value: summary.count, hint: `${summary.winning} winning` },
    { id: 'net', label: 'Net', value: money.full(summary.net), tone: summary.net >= 0 ? 'positive' : 'negative' },
    { id: 'hours', label: 'Hours', value: summary.hours.toFixed(1), hint: `${summary.hands.toLocaleString('en-US')} hands` },
    { id: 'hourly', label: 'Hourly', value: `${money.full(summary.hourly)}/h` },
  ];

  return (
    <div className="game-history">
      <PageHeader title="Game History" subtitle="Every session you logged, newest first, with its grade. Open one to see the whole session or edit it." />

      <div className="game-history-filters">
        <FilterChips options={GAME_OPTIONS} value={game} onChange={setGame} label="Filter by game" />
        {stakesOptions.length > 2 && <FilterChips options={stakesOptions} value={stakes} onChange={setStakes} label="Filter by stakes" />}
        <FilterChips options={optionsOf(sessions, 'venue', 'All venues')} value={venue} onChange={setVenue} label="Filter by venue" />
      </div>

      {/* Totals for the current filter: tap one for its story */}
      <div className="game-history-summary">
        {cards.map(({ id, ...card }) => (
          <StatCard key={id} {...card} ref={detail.cardRef(id)} onOpen={summary.count ? () => detail.open(id) : undefined} />
        ))}
      </div>
      <UnitNote scope={scope} tip="Pick one stake above to see big blinds." className="game-history-note" />
      {tournaments.count > 0 && (
        <p className="game-history-tournaments">
          These totals are cash games. Tournaments: {tournaments.count} played, {tournaments.cashes} cashed,{' '}
          <Money amount={tournaments.net} /> net.
        </p>
      )}

      {/* Month groups */}
      {months.map((month) => {
        const hasCash = cashGames(month.sessions).length > 0;
        return (
          <section key={month.key} className="game-history-month">
            {/* The month's cash-game total (tournament results are on their own rows, in dollars): opens the month */}
            {hasCash ? (
              <button type="button" className="game-history-month-head" onClick={() => detail.open(`month:${month.key}`)} ref={detail.cardRef(`month:${month.key}`)} aria-haspopup="dialog">
                <h2>{month.label}</h2>
                <span className="game-history-month-total">
                  <Money amount={monthNet(month.key)} bb={scope.bb} />
                  <Icon name="chevronRight" size={16} />
                </span>
              </button>
            ) : (
              <div className="game-history-month-head">
                <h2>{month.label}</h2>
              </div>
            )}
            <ul className="game-history-list stagger-in">
              {month.sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  sessionHands={hands.filter((hand) => hand.sessionId === session.id)}
                  isOpen={openId === session.id}
                  onToggle={() => setOpenId(openId === session.id ? null : session.id)}
                  onSaved={replaceSession}
                  onDeleted={() => removeSession(session.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {filtered.length === 0 && <p className="game-history-empty">No sessions match these filters.</p>}

      <DetailSheet open={detail.openKey !== null} onClose={detail.close} title={shownDetail?.title ?? ''} originRef={detail.originRef}>
        {shownDetail && <StatDetail detail={shownDetail} onNavigate={detail.close} />}
      </DetailSheet>
    </div>
  );
}
