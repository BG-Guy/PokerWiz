// Edit one entry on a live session's timeline: a note's text or a rebuy's amount, or take it off the timeline.
// Removing a rebuy takes it off your buy-in too.
import { useState } from 'react';
import { updateSessionEvent, deleteSessionEvent } from '../../api/sessions.js';
import { formatMoney } from '../../utils/format.js';
import Modal from '../../components/Modal/Modal.jsx';
import FormField from '../../components/FormField/FormField.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './EditEntrySheet.css';

// entry: a 'note' or 'rebuy' event. onSaved(session) after a change or a removal.
export default function EditEntrySheet({ session, entry, open, onClose, onSaved }) {
  const isNote = entry.type === 'note';
  const [text, setText] = useState(entry.text ?? '');
  const [amount, setAmount] = useState(String(entry.amount ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Save the new text or amount (nothing to send if it didn't change).
  const save = async (event) => {
    event.preventDefault();
    const changes = isNote ? { text: text.trim() } : { amount: Number(amount) };
    if (isNote ? !changes.text : !(changes.amount > 0)) return setError(isNote ? 'A note needs some text.' : 'Enter a rebuy amount.');
    if (isNote ? changes.text === entry.text : changes.amount === entry.amount) return onClose();
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateSessionEvent(session.id, entry.id, changes));
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={isNote ? 'Edit note' : 'Edit rebuy'} className="edit-entry-sheet">
        <form className="edit-entry-form" onSubmit={save}>
          {isNote ? (
            <FormField label="Note" htmlFor="edit-entry-text">
              <textarea id="edit-entry-text" className="form-input" rows={4} autoFocus value={text} onChange={(event) => setText(event.target.value)} />
            </FormField>
          ) : (
            <FormField label="Rebuy amount" htmlFor="edit-entry-amount" hint={`Your buy-in follows: ${formatMoney(session.buyIn, { sign: false })} now`}>
              <span className="form-money">
                $
                <input
                  id="edit-entry-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  autoFocus
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </span>
            </FormField>
          )}

          {error && (
            <p className="edit-entry-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn edit-entry-save" disabled={saving}>
            <Icon name="check" size={16} /> {saving ? 'Saving' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-danger-ghost edit-entry-delete" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Remove from timeline
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={isNote ? 'Remove this note?' : 'Remove this rebuy?'}
        message={
          isNote
            ? 'The note will be taken off the timeline.'
            : `${formatMoney(entry.amount, { sign: false })} will come off your buy-in (${formatMoney(session.buyIn - entry.amount, { sign: false })} after).`
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          const saved = await deleteSessionEvent(session.id, entry.id);
          setConfirmDelete(false);
          onClose();
          onSaved(saved);
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
