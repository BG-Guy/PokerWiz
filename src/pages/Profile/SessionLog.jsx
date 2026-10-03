// Every session with everything recorded about it, newest first. Filter to cash games or tournaments, or
// search the notes and locations (e.g. "AA", "drunk", "Philly").
import { useState } from 'react';
import { isTournament } from '../../utils/stats.js';
import Panel from '../../components/Panel/Panel.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import SessionLogEntry from './SessionLogEntry.jsx';
import './SessionLog.css';

// Newest first: by day, then by start time within a day.
const byNewest = (a, b) => b.date.localeCompare(a.date) || String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? ''));

export default function SessionLog({ sessions }) {
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const tournaments = sessions.filter(isTournament).length;
  const search = query.trim().toLowerCase();

  const shown = [...sessions]
    .sort(byNewest)
    .filter((s) => kind === 'all' || (kind === 'tournament') === isTournament(s))
    .filter((s) => !search || `${s.notes} ${s.venue} ${s.game} ${s.stakes}`.toLowerCase().includes(search));

  const options = [
    { value: 'all', label: 'All', count: sessions.length },
    { value: 'cash', label: 'Cash games', count: sessions.length - tournaments },
    ...(tournaments > 0 ? [{ value: 'tournament', label: 'Tournaments', count: tournaments }] : []),
  ];

  return (
    <Panel title="Session log" className="session-log">
      <div className="session-log-tools">
        <FilterChips options={options} value={kind} onChange={setKind} label="Show sessions" />
        <label className="session-log-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes and locations" aria-label="Search notes and locations" />
        </label>
      </div>

      {shown.length > 0 ? (
        <ol className="session-log-list">
          {shown.map((session) => (
            <SessionLogEntry key={session.id} session={session} />
          ))}
        </ol>
      ) : (
        <p className="session-log-empty">No sessions match{search ? ` "${query.trim()}"` : ''}.</p>
      )}
    </Panel>
  );
}
