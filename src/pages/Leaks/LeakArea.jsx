// One leak, opened: what it costs and which way you lean (a TLDR that opens the full advice), your play against
// GTO's as bars (tap a play to see only those spots), a breakdown (by seat, hand, pot...) where a tap narrows the
// spots to that group, and the spots themselves, costliest first (tap one for its sheet). A button drills the
// leak in Practice. On a phone it's a page of its own with a way back; on a wide screen it's the panel next to
// the list of leaks.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useClosingValue } from '../../hooks/useClosingValue.js';
import { splitsFor, splitRows, rowIsIn, worstRows, summarize, leanSentence, playsIn, isBetting, leanLabel } from '../../coach/leaks.js';
import { areaDetail, lossText, drillLink } from '../../coach/leakDetails.js';
import { plural } from '../../utils/format.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import Panel from '../../components/Panel/Panel.jsx';
import TldrCard from '../../components/TldrCard/TldrCard.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import DrillRow from '../../components/DrillRow/DrillRow.jsx';
import GradeBadge from '../../components/GradeBadge/GradeBadge.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import YouVsGto from '../../components/YouVsGto/YouVsGto.jsx';
import SpotRow from './SpotRow.jsx';
import SpotSheet from '../../components/SpotSheet/SpotSheet.jsx';
import './LeakArea.css';

const PAGE = 8; // spots shown at first, and each time "Show more" is tapped

// entry: the area's summary with its rows (leakOverview). mode: 'page' (phone: its own page) | 'panel' (wide).
export default function LeakArea({ entry, mode = 'page' }) {
  const { area } = entry;
  const [params, setParams] = useSearchParams();
  const splits = splitsFor(area);
  const split = splits.find((s) => s.id === params.get('by'))?.id ?? splits[0].id;
  const only = params.get('only'); // one group of the split
  const kind = params.get('kind'); // what you did (fold, call...)
  const [shown, setShown] = useState(PAGE);
  const [openRow, setOpenRow] = useState(null);
  const [sheetRow, sheetOpen] = useClosingValue(openRow);

  // The filters live in the address, so Back undoes the last tap.
  const change = (patch) => {
    setShown(PAGE);
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) (value ? next.set(key, value) : next.delete(key));
      return next;
    });
  };

  const groups = useMemo(() => splitRows(entry.rows, split), [entry.rows, split]);
  const filtered = useMemo(() => worstRows(entry.rows.filter((row) => (!only || rowIsIn(row, split, only)) && (!kind || row.you === kind)), entry.rows.length), [entry.rows, split, only, kind]);
  // The rows in the picked group, and their numbers (the bars and the TLDR follow the group).
  const scope = useMemo(() => (only ? entry.rows.filter((row) => rowIsIn(row, split, only)) : entry.rows), [entry.rows, split, only]);
  const view = useMemo(() => summarize(scope), [scope]);
  const maxCost = Math.max(0.01, ...groups.map((group) => group.cost));
  const group = groups.find((g) => g.key === only);
  const kinds = playsIn(area);
  const betting = isBetting(area);
  const drill = drillLink(area.id, only ? split : null, only);
  const heading = `${area.street} · ${area.kind}`;

  return (
    <div className={`leak-area is-${mode}`}>
      {mode === 'page' ? (
        <PageHeader title={area.name} subtitle={heading} back={{ to: '/leaks', label: 'Leaks' }}>
          <Link to={drill} className="btn">
            <Icon name="target" size={16} /> Drill it
          </Link>
        </PageHeader>
      ) : (
        <header className="leak-area-header">
          <div>
            <h2 className="leak-area-title">{area.name}</h2>
            <p className="leak-area-subtitle">{heading}</p>
          </div>
          <Link to={drill} className="btn">
            <Icon name="target" size={16} /> Drill it
          </Link>
        </header>
      )}

      <TldrCard
        icon="drop"
        label={group ? `${group.label} · what the numbers say` : 'What the numbers say'}
        value={lossText(view.cost)}
        tone={view.cost > 0 ? 'negative' : 'positive'}
        sentence={`${plural(view.count, 'spot')}. ${leanSentence(view, area, { counted: true })}`}
        title={area.name}
        cta="Why, and what to do"
      >
        <StatDetail detail={areaDetail({ area, rows: scope, ...view }, { open: false })} />
      </TldrCard>

      <Panel title="You vs GTO" className="leak-area-panel">
        <YouVsGto you={view.you} gto={view.gto} kinds={kinds} betting={betting} active={kind} onPick={(picked) => change({ kind: picked })} />
        <p className="leak-area-hint">Tap a play to see only the spots where you played it.</p>
      </Panel>

      <Panel title="Break it down" className="leak-area-panel">
        <FilterChips label="Break down by" value={split} onChange={(by) => change({ by, only: null })} options={splits.map((s) => ({ value: s.id, label: s.label }))} />
        <ul className="leak-area-groups">
          {groups.map((g) => (
            <li key={g.key}>
              <DrillRow
                onClick={() => change({ only: only === g.key ? null : g.key })}
                lead={<GradeBadge score={g.avgScore} size="sm" />}
                title={g.label}
                subtitle={`${plural(g.count, 'spot')} · ${leanLabel(g, area) ?? (g.count < 5 ? 'early read' : 'no clear lean')}`}
                value={lossText(g.cost)}
                tone={g.cost > 0 ? 'negative' : undefined}
                meter={g.cost / maxCost}
                selected={only === g.key}
                chevron={false}
              />
            </li>
          ))}
        </ul>
        <p className="leak-area-hint">Tap a row to see just those spots.</p>
      </Panel>

      <Panel
        title={`Spots (${filtered.length})`}
        className="leak-area-panel"
        action={
          (only || kind) && (
            <button type="button" className="btn btn-ghost" onClick={() => change({ only: null, kind: null })}>
              <Icon name="close" size={14} /> Clear filters
            </button>
          )
        }
      >
        {(only || kind) && (
          <p className="leak-area-filters">
            Showing {[group?.label, kind && `where you ${{ fold: 'folded', check: 'checked', call: 'called', raise: betting ? 'bet' : 'raised' }[kind]}`].filter(Boolean).join(', ')}
          </p>
        )}
        {filtered.length === 0 ? (
          <p className="leak-area-empty">No spots match. Clear a filter to see more.</p>
        ) : (
          <ul className="leak-area-spots">
            {filtered.slice(0, shown).map((row) => (
              <li key={`${row.handId}-${row.i}`}>
                <SpotRow row={row} onOpen={setOpenRow} />
              </li>
            ))}
          </ul>
        )}
        {filtered.length > shown && (
          <button type="button" className="btn btn-secondary leak-area-more" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
        )}
      </Panel>

      {/* Phones: the drill button stays under your thumb */}
      <div className="leak-area-drill">
        <Link to={drill} className="btn">
          <Icon name="target" size={18} /> Drill {group ? `${group.label}` : 'this leak'} in Practice
        </Link>
      </div>

      <SpotSheet row={sheetRow} open={sheetOpen} onClose={() => setOpenRow(null)} />
    </div>
  );
}
