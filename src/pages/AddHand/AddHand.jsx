// Add Hand page (/hands/new): records a hand with the shared HandRecorder and saves it.
// Opened from a live session (?session=<id>), it starts at that session's stakes and adds the hand to its timeline.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createHand } from '../../api/hands.js';
import { getLiveSession } from '../../api/sessions.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import HandRecorder from '../../components/HandRecorder/HandRecorder.jsx';
import './AddHand.css';

export default function AddHand() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  // Stakes of the live session (undefined while loading, null when there is none).
  const [sessionStakes, setSessionStakes] = useState(sessionId ? undefined : null);

  useEffect(() => {
    if (!sessionId) return;
    getLiveSession()
      .then((live) => setSessionStakes(live?.id === sessionId ? live.stakes : null))
      .catch(() => setSessionStakes(null));
  }, [sessionId]);

  // Persist the recorded hand, then go back to the session or open the saved hand.
  const handleSave = async (payload) => {
    const saved = await createHand({ ...payload, sessionId });
    navigate(sessionId ? '/session' : `/hands/${saved.id}`);
  };

  return (
    <div className="add-hand">
      <PageHeader title="Add hand" subtitle={sessionId ? 'Recording into your live session.' : 'Rebuild the hand one step at a time.'}>
        <Link to={sessionId ? '/session' : '/hands'} className="btn btn-ghost">
          Cancel
        </Link>
      </PageHeader>

      {sessionStakes === undefined ? (
        <LoadState />
      ) : (
        <HandRecorder mode="record" initialStakesLabel={sessionStakes ?? undefined} onSave={handleSave} />
      )}
    </div>
  );
}
