// Profile totals: every session together (in dollars), cash games (in the BB/$ unit, with win rates),
// tournaments (entries, cashes, ROI), and results by location.
import { cashGames, summarize, tournamentSummary, sessionProfit } from '../../utils/stats.js';
import { formatMoney, formatUnits, sessionsForDisplay } from '../../utils/format.js';
import Panel from '../../components/Panel/Panel.jsx';
import StatCard from '../../components/StatCard/StatCard.jsx';
import Money from '../../components/Money/Money.jsx';
import './ProfileSummary.css';

const toneOf = (amount) => (amount > 0 ? 'positive' : amount < 0 ? 'negative' : undefined);

// Sessions, hours, net and hourly (in dollars) per location, most played first.
function byLocation(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    const group = groups.get(s.venue) ?? { venue: s.venue, count: 0, minutes: 0, net: 0 };
    group.count += 1;
    group.minutes += s.durationMin;
    group.net += sessionProfit(s);
    groups.set(s.venue, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes);
}

export default function ProfileSummary({ sessions }) {
  const net = sessions.reduce((sum, s) => sum + sessionProfit(s), 0);
  const hours = sessions.reduce((sum, s) => sum + s.durationMin, 0) / 60;
  const hands = sessions.reduce((sum, s) => sum + s.hands, 0);
  const expenses = sessions.reduce((sum, s) => sum + (s.expenses ?? 0), 0);
  const cash = summarize(sessionsForDisplay(cashGames(sessions))); // in the BB/$ unit
  const tournaments = tournamentSummary(sessions);
  const locations = byLocation(sessions);

  return (
    <Panel title="Your record" className="profile-summary">
      <div className="profile-summary-cards">
        <StatCard
          label="Total result"
          value={formatMoney(net)}
          tone={toneOf(net)}
          hint={`${sessions.length} sessions${expenses > 0 ? ` · after ${formatMoney(expenses, { sign: false })} expenses` : ''}`}
        />
        <StatCard label="Hours played" value={hours.toFixed(1)} hint={`about ${hands.toLocaleString('en-US')} hands`} />
        {cash.count > 0 && (
          <StatCard
            label="Cash games"
            value={formatUnits(cash.net)}
            tone={toneOf(cash.net)}
            hint={`${cash.count} sessions · ${formatUnits(cash.hourly, { whole: true })}/h · ${cash.bbPer100.toFixed(1)} bb/100`}
          />
        )}
        {tournaments.count > 0 && (
          <StatCard
            label="Tournaments"
            value={formatMoney(tournaments.net)}
            tone={toneOf(tournaments.net)}
            hint={`${tournaments.count} played · ${tournaments.cashes} cashed · ROI ${Math.round(tournaments.roi * 100)}%`}
          />
        )}
      </div>

      {/* Where you play: sessions, hours, result and hourly rate per location */}
      <div className="profile-locations">
        <h3 className="profile-locations-title">By location</h3>
        <ul className="profile-locations-list">
          {locations.map((place) => (
            <li key={place.venue} className="profile-location">
              <span className="profile-location-name">{place.venue}</span>
              <span className="profile-location-meta num">
                {place.count} {place.count === 1 ? 'session' : 'sessions'} · {(place.minutes / 60).toFixed(1)} h
                {place.minutes > 0 && ` · ${formatMoney(Math.round(place.net / (place.minutes / 60)))}/h`}
              </span>
              <Money amount={place.net} className="profile-location-net" />
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
