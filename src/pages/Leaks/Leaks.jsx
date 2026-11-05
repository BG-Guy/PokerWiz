// Leaks (/leaks and /leaks/:areaId): where your play gives up the most against GTO. The saved hands are graded in
// the background (the scan card shows how far it is) and added up by kind of spot: headline cards that open
// their full story, then every kind of spot that came up, costliest first. Tap one for its page: your play against
// GTO's, a breakdown, and the spots themselves, down to the hand. On a phone each level is its own page; on a wide
// screen the list stays on the left and the open leak fills the right.
import { useCallback, useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getHands } from '../../api/hands.js';
import { useApi } from '../../hooks/useApi.js';
import { useLeakScan } from '../../hooks/useLeakScan.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { leakOverview } from '../../coach/leaks.js';
import { entryFor, methodDetail } from '../../coach/leakDetails.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Panel from '../../components/Panel/Panel.jsx';
import TldrCard from '../../components/TldrCard/TldrCard.jsx';
import StatDetail from '../../components/StatDetail/StatDetail.jsx';
import HandsTabs from '../../components/HandsTabs/HandsTabs.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import ScanCard from './ScanCard.jsx';
import LeakHighlights from './LeakHighlights.jsx';
import AreaList from './AreaList.jsx';
import LeakArea from './LeakArea.jsx';
import './Leaks.css';

export default function Leaks() {
  const { areaId } = useParams();
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 1100px)');
  const { data: hands, error, reload, setData } = useApi(getHands);
  // Each hand the scan finishes replaces its copy in the list, and the numbers follow.
  const saveHand = useCallback((saved) => setData((list) => list?.map((hand) => (hand.id === saved.id ? saved : hand)) ?? list), [setData]);
  const scan = useLeakScan(hands, saveHand);
  const overview = useMemo(() => (hands ? leakOverview(hands) : null), [hands]);
  const firstArea = overview?.areas[0]?.area.id;

  // A wide screen always shows one leak next to the list: the costliest, until you pick another.
  useEffect(() => {
    if (wide && !areaId && firstArea) navigate(`/leaks/${firstArea}`, { replace: true });
  }, [wide, areaId, firstArea, navigate]);

  if (!hands) return <LoadState error={error} onRetry={reload} />;
  const entry = areaId ? entryFor(overview.areas, areaId) : null;
  if (areaId && !entry) return <Navigate to="/leaks" replace />;

  // A phone: a leak is a page of its own, one tap down from the list.
  if (areaId && !wide) {
    return (
      <div className="leaks">
        <ScanCard scan={scan} />
        <LeakArea key={areaId} entry={entry} mode="page" />
      </div>
    );
  }

  const skipped = hands.filter((hand) => hand.coachDecisions?.detail === 'skipped').length;

  return (
    <div className="leaks">
      <PageHeader title="Leaks" subtitle="Where your play gives up the most against GTO. Tap anything to dig in." />
      <HandsTabs />
      <ScanCard scan={scan} />

      {overview.rows.length === 0 ? (
        <Panel title={hands.length === 0 ? 'Nothing to analyze yet' : scan.running ? 'Your first results are on their way' : 'Nothing the coach could read yet'} className="leaks-empty">
          {hands.length === 0 ? (
            <p>Save hands from your sessions, or record one with the Coach, and this page shows where you leak.</p>
          ) : scan.running ? (
            <p>The preflop decisions come first, in a moment. The flop, turn and river fill in after.</p>
          ) : (
            <p>
              {skipped} of your {hands.length} saved hands couldn&apos;t be read by the coach (it needs No-Limit Hold&apos;em with your two cards and the action in order).
            </p>
          )}
          <div className="leaks-empty-actions">
            <Link to="/hands/new" className="btn">
              <Icon name="plus" size={16} /> Record a hand
            </Link>
            <Link to="/practice" className="btn btn-secondary">
              <Icon name="zap" size={16} /> Practice instead
            </Link>
          </div>
        </Panel>
      ) : (
        <>
          <LeakHighlights overview={overview} />
          <div className="leaks-columns">
            <div className="leaks-list">
              <AreaList areas={overview.areas} selectedId={wide ? areaId : null} />
              <TldrCard icon="bulb" label="How this works" value="EV loss" sentence="Each decision is graded against GTO. Tap to see how the cost, the lean and the sample size are worked out." title="How the leak report works" cta="How it's worked out">
                <StatDetail detail={methodDetail()} />
              </TldrCard>
            </div>
            {wide && entry && (
              <div className="leaks-detail">
                <LeakArea key={areaId} entry={entry} mode="panel" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
