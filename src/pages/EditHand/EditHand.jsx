// Edit Hand page (/hands/:handId/edit): the saved hand is replayed into the shared HandRecorder, which opens on its
// last step. Go back to any step (Undo, or tap it in "Hand so far"), record from there, and save over the hand.
// The date, its session and the tags you added yourself stay. A changed action clears the old coach score; an
// unchanged one keeps the hand's saved result and pot (they can include rake the recorder doesn't know about).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getHand, updateHand } from '../../api/hands.js';
import { restoreRecorder } from '../../components/HandRecorder/restoreHand.js';
import PageHeader from '../../components/PageHeader/PageHeader.jsx';
import LoadState from '../../components/LoadState/LoadState.jsx';
import HandRecorder from '../../components/HandRecorder/HandRecorder.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './EditHand.css';

// Tags the recorder adds by itself (autoTags in utils/handEngine.js): rebuilt from the new action on save.
const isAutoTag = (tag) => /^\d+-bet pot$/.test(tag) || ['Single-raised pot', 'All in', 'Multiway', 'Showdown'].includes(tag);

export default function EditHand() {
  const { handId } = useParams();
  const navigate = useNavigate();
  const [hand, setHand] = useState(null);
  const [restored, setRestored] = useState(null);
  const [error, setError] = useState(null);

  // Load the hand and rebuild the recorder from it.
  useEffect(() => {
    let active = true;
    getHand(handId)
      .then((saved) => {
        if (!active) return;
        const result = restoreRecorder(saved);
        if (result.error) throw new Error(result.error);
        setHand(saved);
        setRestored(result);
      })
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [handId]);

  // Save the re-recorded hand over the old one, then open it.
  const handleSave = async (payload) => {
    const ownTags = (hand.tags ?? []).filter((tag) => !isAutoTag(tag));
    const { replayed } = restored;
    const sameAction =
      JSON.stringify([payload.streets, payload.board, payload.result]) === JSON.stringify([replayed.streets, replayed.board, replayed.result]);
    await updateHand(hand.id, {
      ...payload,
      date: hand.date,
      tags: [...new Set([...payload.tags, ...ownTags])],
      ...(sameAction ? { result: hand.result, potSize: hand.potSize } : { coachAccuracy: null }),
    });
    navigate(`/hands/${hand.id}`);
  };

  return (
    <div className="edit-hand">
      <PageHeader title="Edit the action" subtitle={hand ? hand.title : 'Loading the hand'}>
        <Link to={`/hands/${handId}`} className="btn btn-ghost">
          Cancel
        </Link>
      </PageHeader>

      {!restored ? (
        <LoadState error={error} />
      ) : (
        <>
          {/* How editing works: rewind to a step, then play forward */}
          <p className="edit-hand-hint">
            <Icon name="undo" size={16} />
            <span>
              The whole hand is loaded. Tap a step in <strong>Hand so far</strong> (or Undo) to go back to it, change it, and play the rest
              forward. Your notes and rating are kept.
            </span>
          </p>
          <HandRecorder mode="record" initial={restored.initial} initialDetails={restored.details} saveLabel="Save changes" onSave={handleSave} />
        </>
      )}
    </div>
  );
}
