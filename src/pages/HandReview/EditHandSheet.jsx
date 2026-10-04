// Edit a saved hand: its title, date, stakes, your cards, the board, the pot and your result, and its tags.
// To change the action itself, "Edit the action" reopens the hand in the recorder; "Delete hand" removes it.
// Your review (verdict, rating, tilt, notes) is edited right on the hand page.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateHand, deleteHand } from '../../api/hands.js';
import { STAKES } from '../../constants/poker.js';
import { bigBlindOf, formatMoney } from '../../utils/format.js';
import Modal from '../../components/Modal/Modal.jsx';
import FormField from '../../components/FormField/FormField.jsx';
import CardSlot from '../../components/CardSlot/CardSlot.jsx';
import CardPicker from '../../components/CardPicker/CardPicker.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import { coachSupport } from '../../coach/savedHand.js';
import './EditHandSheet.css';

const sameList = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

// onSaved(hand) with the saved copy; onDeleted() once the hand is gone.
export default function EditHandSheet({ hand, open, onClose, onSaved, onDeleted }) {
  const [title, setTitle] = useState(hand.title);
  const [date, setDate] = useState(hand.date);
  const [stakes, setStakes] = useState(hand.stakes);
  const [holeCards, setHoleCards] = useState(hand.holeCards);
  const [board, setBoard] = useState(hand.board ?? []);
  const [result, setResult] = useState(String(hand.result ?? 0));
  const [pot, setPot] = useState(String(hand.potSize ?? 0));
  const [tags, setTags] = useState(hand.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [picker, setPicker] = useState(null); // 'hero' | 'board' | null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const bb = bigBlindOf(stakes);
  // Hold'em hands can have their cards and their action changed; other games (PLO) keep their cards as is.
  const holdem = hand.holeCards.length === 2;
  const canReRecord = coachSupport(hand).ok;
  const villainCards = (hand.players ?? []).filter((p) => p.role === 'villain').flatMap((p) => p.cards ?? []);
  const stakesOptions = STAKES.some((s) => s.label === hand.stakes) ? STAKES.map((s) => s.label) : [hand.stakes, ...STAKES.map((s) => s.label)];

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setNewTag('');
  };

  // Send only what changed.
  const save = async (event) => {
    event.preventDefault();
    const changes = {};
    if (title.trim() !== hand.title) changes.title = title.trim();
    if (date !== hand.date) changes.date = date;
    if (stakes !== hand.stakes) changes.stakes = stakes;
    if (!sameList(holeCards, hand.holeCards)) {
      changes.holeCards = holeCards;
      if (hand.players) changes.players = hand.players.map((p) => (p.role === 'hero' ? { ...p, cards: holeCards } : p));
    }
    if (!sameList(board, hand.board)) changes.board = board;
    if (Number(result) !== hand.result) changes.result = Number(result);
    if (Number(pot) !== hand.potSize) changes.potSize = Number(pot);
    if (!sameList(tags, hand.tags)) changes.tags = tags;
    if (!Object.keys(changes).length) return onClose();
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateHand(hand.id, changes));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Edit hand" className="edit-hand-sheet">
        <form className="edit-hand-form" onSubmit={save}>
          <FormField label="Title" htmlFor="edit-hand-title">
            <input id="edit-hand-title" className="form-input" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </FormField>

          <div className="form-grid">
            <FormField label="Date" htmlFor="edit-hand-date">
              <input id="edit-hand-date" type="date" className="form-input" value={date} onChange={(event) => setDate(event.target.value)} />
            </FormField>
            <FormField label="Stakes" htmlFor="edit-hand-stakes">
              <select id="edit-hand-stakes" className="form-input" value={stakes} onChange={(event) => setStakes(event.target.value)}>
                {stakesOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {/* Cards: tap a card to change it */}
          <div className="edit-hand-cards">
            <FormField label="Your hand">
              <div className="edit-hand-slots">
                {holdem
                  ? [0, 1].map((i) => <CardSlot key={i} code={holeCards[i]} size="md" label={`Your card ${i + 1}`} onClick={() => setPicker('hero')} />)
                  : holeCards.map((code) => <PlayingCard key={code} code={code} size="md" />)}
              </div>
            </FormField>
            <FormField label="Board">
              <div className="edit-hand-slots">
                {[0, 1, 2, 3, 4].map((i) => (
                  <CardSlot key={i} code={board[i]} size="md" label={`Board card ${i + 1}`} onClick={() => setPicker('board')} />
                ))}
              </div>
            </FormField>
          </div>

          <div className="form-grid">
            <FormField label="Your result" htmlFor="edit-hand-result" hint={`${formatMoney(Number(result) || 0, { bb })} · negative if you lost`}>
              <span className="form-money">
                $
                <input id="edit-hand-result" type="number" inputMode="decimal" step="any" value={result} onChange={(event) => setResult(event.target.value)} />
              </span>
            </FormField>
            <FormField label="Final pot" htmlFor="edit-hand-pot" hint={formatMoney(Number(pot) || 0, { sign: false, bb })}>
              <span className="form-money">
                $
                <input id="edit-hand-pot" type="number" inputMode="decimal" min="0" step="any" value={pot} onChange={(event) => setPot(event.target.value)} />
              </span>
            </FormField>
          </div>

          <FormField label="Tags" htmlFor="edit-hand-tag">
            <div className="edit-hand-tags">
              {tags.map((tag) => (
                <span key={tag} className="edit-hand-tag">
                  {tag}
                  <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`}>
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
              <input
                id="edit-hand-tag"
                className="edit-hand-tag-input"
                placeholder="Add a tag"
                value={newTag}
                maxLength={40}
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
              />
            </div>
          </FormField>

          {error && (
            <p className="edit-hand-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn edit-hand-save" disabled={saving || !title.trim()}>
            <Icon name="check" size={16} /> {saving ? 'Saving' : 'Save changes'}
          </button>

          {/* The action itself: replay it in the recorder and change any step */}
          {canReRecord ? (
            <Link to={`/hands/${hand.id}/edit`} className="edit-hand-action">
              <Icon name="undo" size={18} />
              <span>
                <strong>Edit the action</strong>
                <span>Reopen the hand in the recorder and change any step: seats, stacks, bets, the board.</span>
              </span>
              <Icon name="chevronRight" size={16} />
            </Link>
          ) : (
            <p className="edit-hand-action-off">The recorder rebuilds No-Limit Hold'em hands only, so this hand's action can't be re-recorded.</p>
          )}

          <button type="button" className="btn btn-danger-ghost edit-hand-delete" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Delete hand
          </button>
        </form>
      </Modal>

      <CardPicker
        open={picker === 'hero'}
        title="Your hand"
        count={2}
        initial={holeCards}
        used={[...board, ...villainCards]}
        onDone={(codes) => {
          setHoleCards(codes);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <CardPicker
        open={picker === 'board'}
        title="Board"
        count={5}
        allowPartial
        initial={board}
        used={[...holeCards, ...villainCards]}
        onDone={(codes) => {
          setBoard(codes);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this hand?"
        message={`"${hand.title}" will be removed from your hands${hand.sessionId ? ' and from its session' : ''}. This can't be undone.`}
        confirmLabel="Delete hand"
        onConfirm={async () => {
          await deleteHand(hand.id);
          setConfirmDelete(false);
          onClose();
          onDeleted();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
