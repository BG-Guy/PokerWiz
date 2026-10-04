// "Are you sure?" dialog for things that can't be undone (deleting a hand, a session, a goal). Shows what will
// happen, a red confirm button and a way out; the confirm button waits while the action runs.
import { useState } from 'react';
import Modal from '../Modal/Modal.jsx';
import Icon from '../Icon/Icon.jsx';
import './ConfirmDialog.css';

// onConfirm may return a promise: the dialog shows "Working" until it settles, and its error if it fails.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} className="confirm-dialog">
      <p className="confirm-dialog-message">{message}</p>
      {error && (
        <p className="confirm-dialog-error" role="alert">
          {error}
        </p>
      )}
      <div className="confirm-dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
          <Icon name="trash" size={16} /> {busy ? 'Working' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
