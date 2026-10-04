// Hand Review page: searchable, sortable hand list plus a street-by-street replay of the selected hand, which
// can be edited or deleted. Phones show one pane at a time (list, or the opened hand); desktop shows both.
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getHands, updateHand } from '../../api/hands.js';
import { getSessions } from '../../api/sessions.js';
import { useApi } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import HandsTabs from '../../components/HandsTabs/HandsTabs.jsx';
import HandList from './HandList.jsx';
import HandDetail from './HandDetail.jsx';
import './HandReview.css';

const loadHandReview = () => Promise.all([getHands(), getSessions()]);

// Order hands for the chosen sort. The list comes newest first; rated/unrated sorts keep that order within
// each group.
function sortHands(hands, sort) {
  const rating = (hand) => hand.rating ?? null;
  const list = [...hands];
  if (sort === 'best') list.sort((a, b) => (rating(b) ?? -1) - (rating(a) ?? -1));
  else if (sort === 'worst') list.sort((a, b) => (rating(a) ?? 6) - (rating(b) ?? 6));
  else if (sort === 'unrated') list.sort((a, b) => (rating(a) == null ? 0 : 1) - (rating(b) == null ? 0 : 1));
  return list;
}

export default function HandReview() {
  const { handId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const [saveError, setSaveError] = useState(null);
  const { data, error, reload, setData } = useApi(loadHandReview);

  if (!data) return <LoadState error={error} onRetry={reload} />;
  const [allHands, sessions] = data;

  // Narrow down: session link from Game History, then verdict chip, then free-text search.
  const sessionHands = sessionId ? allHands.filter((hand) => hand.sessionId === sessionId) : allHands;
  const needle = query.trim().toLowerCase();
  const filteredHands = sessionHands.filter((hand) => {
    if (verdictFilter !== 'all' && hand.verdict !== verdictFilter) return false;
    if (!needle) return true;
    return [hand.title, hand.heroPosition, hand.stakes, hand.game, ...(hand.tags ?? []), ...hand.holeCards].some((text) =>
      String(text).toLowerCase().includes(needle)
    );
  });
  const visibleHands = sortHands(filteredHands, sort);

  // The opened hand comes from the URL; on desktop fall back to the first hand in the list.
  const selectedHand = allHands.find((hand) => hand.id === handId) ?? visibleHands[0];
  const session = sessionId ? sessions.find((s) => s.id === sessionId) : null;
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

  // Apply an edit on screen right away; persist to the server unless told not to (e.g. while typing).
  const updateReview = (id, changes, persist = true) => {
    setData(([hands, list]) => [hands.map((hand) => (hand.id === id ? { ...hand, ...changes } : hand)), list]);
    if (!persist) return;
    setSaveError(null);
    updateHand(id, changes).catch((err) => setSaveError(err.message));
  };

  // After an edit was saved (the edit sheet saves first): show the server's copy of the hand.
  const replaceHand = (saved) => setData(([hands, list]) => [hands.map((hand) => (hand.id === saved.id ? saved : hand)), list]);
  // After a delete: drop it from the list and go back to the list.
  const removeHand = (id) => {
    setData(([hands, list]) => [hands.filter((hand) => hand.id !== id), list]);
    navigate(`/hands${search}`);
  };

  return (
    <div className={`hand-review ${handId ? 'has-selection' : ''}`}>
      <div className="hand-review-header">
        <PageHeader title="Hand Review" subtitle="Replay key hands street by street and note what you learned.">
          <Link to={sessionId ? `/hands/new?session=${sessionId}` : '/hands/new'} className="btn">
            <Icon name="plus" size={16} /> Add hand
          </Link>
        </PageHeader>
        <HandsTabs />
      </div>

      {saveError && (
        <p className="hand-review-error" role="alert">
          Could not save your change: {saveError}
        </p>
      )}

      <div className="hand-review-layout">
        <div className="hand-review-list">
          <HandList
            hands={visibleHands}
            countSource={sessionHands}
            selectedId={selectedHand?.id}
            verdictFilter={verdictFilter}
            onVerdictChange={setVerdictFilter}
            sort={sort}
            onSortChange={setSort}
            onRate={(id, rating) => updateReview(id, { rating })}
            query={query}
            onQueryChange={setQuery}
            session={session}
            onClearSession={() => setSearchParams({})}
            linkSearch={search}
          />
        </div>

        <div className="hand-review-detail">
          {selectedHand ? (
            <HandDetail
              key={selectedHand.id}
              hand={selectedHand}
              backTo={`/hands${search}`}
              onUpdate={(changes, persist) => updateReview(selectedHand.id, changes, persist)}
              onSaved={replaceHand}
              onDeleted={() => removeHand(selectedHand.id)}
            />
          ) : (
            <p className="hand-review-empty">No hands match these filters.</p>
          )}
        </div>
      </div>
    </div>
  );
}
