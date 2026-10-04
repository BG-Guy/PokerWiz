// Add or edit a goal: what it measures, the target, a name, and its time window. Editing also offers Delete.
// Goals are measured from your sessions and hands (server/models/goals.js), so only trackable metrics are offered.
import { useState } from 'react';
import { createGoal, updateGoal, deleteGoal } from '../../api/goals.js';
import { formatGoalValue, todayIso } from '../../utils/format.js';
import Modal from '../../components/Modal/Modal.jsx';
import FormField from '../../components/FormField/FormField.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import './GoalSheet.css';

// What a goal can measure: its unit, and how a suggested name reads for a target.
const METRICS = [
  { value: 'hands_played', label: 'Hands played', unit: 'hands', name: (t) => `Play ${t} hands` },
  { value: 'hours_played', label: 'Hours played', unit: 'hours', name: (t) => `Put in ${t} hours at the tables` },
  { value: 'sessions_played', label: 'Sessions', unit: 'sessions', name: (t) => `Play ${t} sessions` },
  { value: 'net_profit', label: 'Net profit', unit: '$', name: (t) => `Win $${t}` },
  { value: 'hands_reviewed', label: 'Hands reviewed', unit: 'hands', name: (t) => `Review ${t} hands` },
];

// Quick deadlines: the end of this month, quarter and year.
function deadlineOptions(today) {
  const [year, month] = today.split('-').map(Number);
  const endOf = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of the next month
  return [
    { label: 'End of month', value: endOf(year, month) },
    { label: 'End of quarter', value: endOf(year, Math.ceil(month / 3) * 3) },
    { label: 'End of year', value: `${year}-12-31` },
  ];
}

// goal: the goal to edit, or null to add one. onSaved(goal) with the saved copy; onDeleted() once it's gone.
export default function GoalSheet({ goal = null, open, onClose, onSaved, onDeleted }) {
  const today = todayIso();
  const [metric, setMetric] = useState(goal?.metric ?? 'hands_played');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [title, setTitle] = useState(goal?.title ?? '');
  const [titleEdited, setTitleEdited] = useState(Boolean(goal));
  const [startDate, setStartDate] = useState(goal?.startDate ?? today);
  const [deadline, setDeadline] = useState(goal?.deadline ?? deadlineOptions(today)[1].value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const metricInfo = METRICS.find((m) => m.value === metric);
  const targetValue = target === '' ? NaN : Number(target);
  // Until you type your own name, the goal is named after its metric and target.
  const suggestedTitle = targetValue > 0 ? metricInfo.name(Math.round(targetValue).toLocaleString('en-US')) : '';
  const shownTitle = titleEdited ? title : suggestedTitle;

  const save = async (event) => {
    event.preventDefault();
    if (!(targetValue > 0)) return setError('Set a target above zero.');
    if (!shownTitle.trim()) return setError('Give the goal a name.');
    if (!(deadline > startDate)) return setError('The deadline must come after the start date.');
    const fields = { title: shownTitle.trim(), metric, target: targetValue, startDate, deadline };
    setSaving(true);
    setError(null);
    try {
      onSaved(goal ? await updateGoal(goal.id, fields) : await createGoal(fields));
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New goal'} className="goal-sheet">
        <form className="goal-sheet-form" onSubmit={save}>
          <FormField label="What do you want to track?">
            <FilterChips options={METRICS} value={metric} onChange={setMetric} label="Goal metric" />
          </FormField>

          <FormField label="Target" htmlFor="goal-target" hint={targetValue > 0 ? formatGoalValue(targetValue, metricInfo.unit) : undefined}>
            <span className="form-money">
              {metricInfo.unit === '$' && '$'}
              <input
                id="goal-target"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
              {metricInfo.unit !== '$' && <span className="goal-sheet-unit">{metricInfo.unit}</span>}
            </span>
          </FormField>

          <FormField label="Name" htmlFor="goal-title">
            <input
              id="goal-title"
              className="form-input"
              maxLength={120}
              placeholder="Name your goal"
              value={shownTitle}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEdited(true);
              }}
            />
          </FormField>

          {/* Time window, with quick deadlines */}
          <div className="form-grid">
            <FormField label="Starts" htmlFor="goal-start">
              <input id="goal-start" type="date" className="form-input" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </FormField>
            <FormField label="Deadline" htmlFor="goal-deadline">
              <input id="goal-deadline" type="date" className="form-input" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            </FormField>
          </div>
          <div className="goal-sheet-quick" role="group" aria-label="Quick deadlines">
            {deadlineOptions(today).map((option) => (
              <button
                key={option.label}
                type="button"
                className={`filter-chip ${deadline === option.value ? 'is-active' : ''}`}
                aria-pressed={deadline === option.value}
                onClick={() => setDeadline(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="goal-sheet-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn goal-sheet-save" disabled={saving}>
            <Icon name="check" size={16} /> {saving ? 'Saving' : goal ? 'Save changes' : 'Add goal'}
          </button>
          {goal && (
            <button type="button" className="btn btn-danger-ghost goal-sheet-delete" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} /> Delete goal
            </button>
          )}
        </form>
      </Modal>

      {goal && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this goal?"
          message={`"${goal.title}" will be removed. Your sessions and hands aren't touched.`}
          confirmLabel="Delete goal"
          onConfirm={async () => {
            await deleteGoal(goal.id);
            setConfirmDelete(false);
            onClose();
            onDeleted();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
