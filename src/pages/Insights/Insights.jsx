// Insights page: what your bankroll is telling you. Five cards (downswing, month to month, sessions, hours,
// and an honest "is it normal?" check) plus a pep line, then the bankroll chart. Each card opens a detailed
// view: a bottom sheet on phones, the card growing into a panel on larger screens. Cash games only (tournaments
// have no big blind); the full-screen chart can switch to tournaments.
import { useMemo } from 'react';
import { getSessions } from '../../api/sessions.js';
import { useApi } from '../../hooks/useApi.js';
import { useDetailView } from '../../hooks/useDetailView.js';
import { cashGames, summarize } from '../../utils/stats.js';
import { bankrollInsights } from '../../utils/sessionInsights.js';
import { statDetail, longMonth, shortMonth } from '../../utils/insightDetails.js';
import { amountFormatters, formatDate, sessionsForDisplay, todayIso } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Panel from '../../components/Panel/Panel.jsx';
import BankrollChart from '../../components/BankrollChart/BankrollChart.jsx';
import InsightCard from '../../components/InsightCard/InsightCard.jsx';
import DetailSheet from '../../components/DetailSheet/DetailSheet.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import PepQuote from './PepQuote.jsx';
import './Insights.css';

const hoursText = (h) => `${Math.round(h).toLocaleString('en-US')}h`;

export default function Insights() {
  const { data, error, reload } = useApi(getSessions);
  const detail = useDetailView();
  // Cash games in the BB/$ unit, and everything the cards say about them (one pass, includes the simulation).
  const sessions = useMemo(() => data && sessionsForDisplay(cashGames(data)), [data]);
  const insights = useMemo(() => sessions?.length && bankrollInsights(sessions), [sessions]);
  const shownDetail = useMemo(() => detail.shownKey && sessions && statDetail(detail.shownKey, sessions), [detail.shownKey, sessions]);

  if (!sessions) return <LoadState error={error} onRetry={reload} />;
  if (sessions.length === 0) return <LoadState error={new Error('Finish a cash session to unlock insights.')} />;

  const money = amountFormatters();
  const cards = insightCards(insights, sessions, money);

  return (
    <div className="insights">
      <PageHeader title="Insights" subtitle="What your bankroll is telling you. Tap a card for the full story." />

      {/* The five insights and a line of encouragement */}
      <div className="insights-grid">
        {cards.map((card, i) => (
          <div key={card.key} className={`insights-grid-item ${card.half ? 'is-half' : ''}`} style={{ '--i': i }}>
            <InsightCard label={card.label} icon={card.icon} value={card.value} tone={card.tone} sentence={card.sentence} ref={detail.cardRef(card.key)} onOpen={() => detail.open(card.key)} />
          </div>
        ))}
        <div className="insights-grid-item insights-pep" style={{ '--i': cards.length }}>
          <PepQuote pep={insights.pep} />
        </div>
      </div>

      {/* The curve behind it all */}
      <Panel title="Bankroll" className="insights-bankroll">
        <BankrollChart sessions={data} />
      </Panel>

      <DetailSheet open={detail.openKey !== null} onClose={detail.close} title={shownDetail?.title ?? ''} originRef={detail.originRef}>
        {shownDetail && <StatDetail detail={shownDetail} />}
      </DetailSheet>
    </div>
  );
}

// What each card says up front (the TLDR); the detail view tells the rest.
function insightCards({ downswing, months, played, normal }, sessions, money) {
  const thisMonth = todayIso().slice(0, 7);
  const latest = months.latest;
  const latestName = latest.month === thisMonth ? `${longMonth(latest.month).split(' ')[0]} so far` : longMonth(latest.month);
  const change = latest.change;
  const summary = summarize(sessions);

  return [
    {
      key: 'downswing',
      label: 'Downswing',
      icon: 'trendDown',
      ...(downswing.inDownswing
        ? {
            value: money.full(-downswing.below),
            tone: 'negative',
            sentence: `Below your peak${downswing.peakDate ? ` of ${formatDate(downswing.peakDate)}` : ''}, ${downswing.sessions} sessions and ${hoursText(downswing.hours)} in.${
              downswing.worst > downswing.below ? ` At its deepest: ${money.full(-downswing.worst)}.` : ''
            }`,
          }
        : {
            value: 'None',
            tone: 'positive',
            sentence: downswing.below > 0 ? `You're within ${money.full(downswing.below, { sign: false })} of your best. No downswing right now.` : "You're at your best ever. No downswing right now.",
          }),
    },
    {
      key: 'normal',
      label: 'Is it normal?',
      icon: 'target',
      value: normal.label,
      tone: normal.status === 'unusual' ? 'negative' : undefined,
      sentence: normal.sentence,
    },
    {
      key: 'months',
      label: 'Month to month',
      icon: 'calendar',
      value: money.full(latest.net),
      tone: latest.net > 0 ? 'positive' : latest.net < 0 ? 'negative' : undefined,
      sentence:
        change === null
          ? `${latestName}, your first month on record.`
          : `${latestName}: ${change >= 0 ? 'up' : 'down'} ${money.full(Math.abs(change), { sign: false })} on ${shortMonth(months.previous.month)}. Best month: ${longMonth(months.best.month).split(' ')[0]}.`,
    },
    {
      key: 'sessions',
      half: true,
      label: 'Sessions',
      icon: 'flag',
      value: played.sessions.toLocaleString('en-US'),
      sentence: `About ${played.perWeek.toFixed(1)} a week, and ${Math.round(summary.winningShare * 100)}% of them winners.`,
    },
    {
      key: 'hours',
      half: true,
      label: 'Hours',
      icon: 'clock',
      value: hoursText(played.hours),
      sentence: `${played.averageHours.toFixed(1)}h a session on average, at ${money.full(summary.hourly)}/h.`,
    },
  ];
}
