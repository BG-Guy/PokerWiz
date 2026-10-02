// Add Hand page (/hands/new): records a hand with the shared HandRecorder and saves it.
// Opened from a live session (?session=<id>), it starts at that session's stakes and adds the hand to its timeline.
// At /hands/:handId/edit it re-records a saved hand: same stakes and table to start, the review carried over,
// and saving replaces the old version (keeping its date and session).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createHand, getHand, replaceHand } from '../../api/hands.js';
import { getLiveSession } from '../../api/sessions.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import HandRecorder from '../../components/HandRecorder/HandRecorder.jsx';
import './AddHand.css';

export default function AddHand() {
  const navigate = useNavigate();
  const { handId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = handId ? null : searchParams.get('session');
  // Stakes of the live session (undefined while loading, null when there is none).
  const [sessionStakes, setSessionStakes] = useState(sessionId ? undefined : null);
  // The hand being re-recorded (undefined while loading).
  const [original, setOriginal] = useState(handId ? undefined : null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    getLiveSession()
      .then((live) => setSessionStakes(live?.id === sessionId ? live.stakes : null))
      .catch(() => setSessionStakes(null));
  }, [sessionId]);

  useEffect(() => {
    if (!handId) return;
    getHand(handId).then(setOriginal).catch(setLoadError);
  }, [handId]);

  // Persist the recorded hand, then go back to the session or open the saved hand.
  const handleSave = async (payload) => {
    if (original) {
      // A re-recorded hand keeps its original date, and the tags it had on top of the new automatic ones.
      const { date: _today, tags, ...rest } = payload;
      await replaceHand(original.id, { ...rest, tags: [...new Set([...(original.tags ?? []), ...tags])] });
      navigate(`/hands/${original.id}`);
      return;
    }
    const saved = await createHand({ ...payload, sessionId });
    navigate(sessionId ? '/session' : `/hands/${saved.id}`);
  };

  const cancelTo = handId ? `/hands/${handId}` : sessionId ? '/session' : '/hands';
  const subtitle = handId
    ? 'Record the hand again from the first question. Your notes, verdict and rating are kept.'
    : sessionId
      ? 'Recording into your live session.'
      : 'Rebuild the hand one step at a time.';

  return (
    <div className="add-hand">
      <PageHeader title={handId ? 'Re-record hand' : 'Add hand'} subtitle={subtitle}>
        <Link to={cancelTo} className="btn btn-ghost">
          Cancel
        </Link>
      </PageHeader>

      {sessionStakes === undefined || original === undefined ? (
        <LoadState error={loadError} />
      ) : (
        <HandRecorder
          mode="record"
          initialStakesLabel={original?.stakes ?? sessionStakes ?? undefined}
          initialTableSize={original?.tableSize}
          initialDetails={original ? { title: original.title, verdict: original.verdict, note: original.note, rating: original.rating, tilt: original.tilt } : undefined}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
