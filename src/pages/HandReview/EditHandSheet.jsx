// "Edit hand" sheet in Hand Review: fix a saved hand's title, date, stakes, seat, cards, board,
// pot, result and tags, re-record its action, or delete it. Amounts are entered in dollars.
// Mount it only while open, so it starts from the saved values.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteHand, updateHand } from '../../api/hands.js';
import { STAKES, TABLE_POSITIONS } from '../../constants/poker.js';
import Modal from '../../components/Modal/Modal.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import CardSlot from '../../components/CardSlot/CardSlot.jsx';
import CardPicker from '../../components/CardPicker/CardPicker.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import { EditFormFooter, Field, MoneyInput } from '../../components/EditForm/EditForm.jsx';
import './EditHandSheet.css';

const RESULT_OPTIONS = [
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];
const BOARD_SIZES = [0, 3, 4, 5]; // preflop, flop, turn, river

// Chip lists that always include the hand's current value, even when it isn't one of the usual ones.
const withCurrent = (values, current) => (values.includes(current) || !current ? values : [...values, current]);
const asOptions = (values) => values.map((v) => ({ value: v, label: v }));

export default function EditHandSheet({ hand, onClose, onSaved, onDeleted }) {
  // Hands recorded seat by seat keep their seats and board size; only re-recording changes those.
  const recorded = Array.isArray(hand.players);
  const [form, setForm] = useState({
    title: hand.title ?? '',
    date: hand.date,
    stakes: hand.stakes,
    heroPosition: hand.heroPosition,
    holeCards: hand.holeCards ?? [],
    board: hand.board ?? [],
    villainCards: Object.fromEntries((hand.players ?? []).filter((p) => p.role === 'villain').map((p) => [p.seat, p.cards ?? []])),
    potSize: String(hand.potSize ?? ''),
    outcome: (hand.result ?? 0) < 0 ? 'lost' : 'won',
    amount: String(Math.abs(hand.result ?? 0)),
    tags: (hand.tags ?? []).join(', '),
  });
  const [picking, setPicking] = useState(null); // { target: 'hero' | 'board' | seat, title, count, allowPartial }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (changes) => setForm((f) => ({ ...f, ...changes }));

  const villains = (hand.players ?? []).filter((p) => p.role === 'villain');
  const usedCards = [...form.holeCards, ...form.board, ...Object.values(form.villainCards).flat()];
  const positions = withCurrent(TABLE_POSITIONS[8], form.heroPosition);
  const stakes = withCurrent(STAKES.map((s) => s.label), form.stakes);

  const pickedCards = (target) =>
    target === 'hero' ? form.holeCards : target === 'board' ? form.board : form.villainCards[target] ?? [];
  const handlePicked = (codes) => {
    const { target } = picking;
    if (target === 'hero') set({ holeCards: codes });
    else if (target === 'board') set({ board: codes });
    else set({ villainCards: { ...form.villainCards, [target]: codes } });
    setPicking(null);
  };

  // Turn the form into an API edit, or explain what's wrong.
  const buildChanges = () => {
    const potSize = Number(form.potSize);
    const amount = Number(form.amount);
    if (!form.title.trim()) return { error: 'Give the hand a title.' };
    if (!form.date) return { error: 'Pick the date of the hand.' };
    if (form.holeCards.length !== 2) return { error: 'Pick both of your cards.' };
    if (!BOARD_SIZES.includes(form.board.length)) return { error: 'A board has 3, 4 or 5 cards (or none if the hand ended preflop).' };
    if (form.potSize === '' || !(potSize >= 0)) return { error: 'Enter the final pot (0 or more).' };
    if (form.amount === '' || !(amount >= 0)) return { error: 'Enter how much you won or lost.' };

    const changes = {
      title: form.title.trim(),
      date: form.date,
      stakes: form.stakes,
      heroPosition: form.heroPosition,
      holeCards: form.holeCards,
      board: form.board,
      potSize,
      result: form.outcome === 'lost' ? -amount : amount,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (recorded) {
      changes.players = hand.players.map((p) =>
        p.role === 'hero' ? { ...p, cards: form.holeCards } : { ...p, cards: form.villainCards[p.seat] ?? p.cards }
      );
    }
    return { changes };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const { changes, error: problem } = buildChanges();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateHand(hand.id, changes));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteHand(hand.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  // Row of tappable card slots that opens the deck picker.
  const cardRow = (target, title, count, allowPartial = false) => (
    <div className="edit-hand-cards">
      {Array.from({ length: count }, (_, i) => (
        <CardSlot
          key={i}
          code={pickedCards(target)[i]}
          label={title}
          onClick={() => setPicking({ target, title, count, allowPartial })}
        />
      ))}
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Edit hand" className="edit-hand-modal">
      <form className="edit-form" onSubmit={handleSubmit}>
        <Field label="Title" htmlFor="edit-hand-title">
          <input id="edit-hand-title" className="edit-form-input" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        <Field label="Date" htmlFor="edit-hand-date">
          <input id="edit-hand-date" type="date" className="edit-form-input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>

        <Field label="Stakes">
          <FilterChips options={asOptions(stakes)} value={form.stakes} onChange={(value) => set({ stakes: value })} label="Stakes" />
        </Field>

        {!recorded && (
          <Field label="Your position">
            <FilterChips options={asOptions(positions)} value={form.heroPosition} onChange={(value) => set({ heroPosition: value })} label="Your position" />
          </Field>
        )}

        <div className="edit-hand-card-fields">
          <Field label="Your hand">{cardRow('hero', 'Your hand', 2)}</Field>
          {villains.map((villain) => (
            <Field key={villain.seat} label={`Villain · ${villain.position}`}>
              {cardRow(villain.seat, `Villain hand (${villain.position})`, 2, true)}
            </Field>
          ))}
        </div>

        {/* Recorded hands keep the number of board cards their action reached */}
        {(!recorded || hand.board.length > 0) && (
          <Field label="Board" hint={recorded ? null : 'Leave it empty if the hand ended preflop.'}>
            {cardRow('board', 'Board', recorded ? hand.board.length : 5, !recorded)}
          </Field>
        )}

        <div className="edit-form-row">
          <Field label="Final pot" htmlFor="edit-hand-pot">
            <MoneyInput id="edit-hand-pot" value={form.potSize} onChange={(potSize) => set({ potSize })} label="Final pot in dollars" />
          </Field>
          <Field label="Your result" htmlFor="edit-hand-result">
            <MoneyInput id="edit-hand-result" value={form.amount} onChange={(amount) => set({ amount })} label="Amount won or lost in dollars" />
          </Field>
        </div>
        <FilterChips options={RESULT_OPTIONS} value={form.outcome} onChange={(outcome) => set({ outcome })} label="Won or lost" />

        <Field label="Tags" htmlFor="edit-hand-tags" hint="Separate tags with commas.">
          <input
            id="edit-hand-tags"
            className="edit-form-input"
            value={form.tags}
            placeholder="Big pot, Bluff"
            onChange={(e) => set({ tags: e.target.value })}
          />
        </Field>

        {/* Seats and actions can't be patched one by one; re-recording replaces them and keeps the review */}
        <Link to={`/hands/${hand.id}/edit`} className="edit-hand-rerecord">
          <span className="edit-hand-rerecord-icon">
            <Icon name="undo" size={18} />
          </span>
          <span>
            <strong>Re-record the action</strong>
            <span>Go through the hand again on the table. Your notes, verdict and rating are kept.</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>

        <EditFormFooter error={error} saving={saving} onDelete={handleDelete} confirmText="Delete this hand? This can't be undone." />
      </form>

      <CardPicker
        open={picking !== null}
        title={picking?.title ?? ''}
        count={picking?.count ?? 2}
        initial={picking ? pickedCards(picking.target) : []}
        used={usedCards}
        allowPartial={picking?.allowPartial}
        onDone={handlePicked}
        onClose={() => setPicking(null)}
      />
    </Modal>
  );
}
