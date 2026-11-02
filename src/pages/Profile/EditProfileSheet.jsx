// Edit your profile (a sheet that slides up on phones): name, nickname, home casino, usual stakes, favorite
// game and the year you started playing. Saved on the server, and kept in your backups.
import { useState } from 'react';
import { updateSettings } from '../../api/settings.js';
import { GAMES, STAKES } from '../../constants/poker.js';
import Modal from '../../components/Modal/Modal.jsx';
import FormField from '../../components/FormField/FormField.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import ChoiceChips from './ChoiceChips.jsx';
import './EditProfileSheet.css';

const THIS_YEAR = new Date().getFullYear();

// settings: the current ones. onSaved(settings) with what the server saved.
export default function EditProfileSheet({ open, onClose, settings, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: settings.name,
    nickname: settings.nickname,
    homeCasino: settings.homeCasino,
    usualStakes: settings.usualStakes,
    favoriteGame: settings.favoriteGame,
    playingSince: settings.playingSince ? String(settings.playingSince) : '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  // The stakes buttons, plus your custom stakes (and whatever is set now, if it's neither).
  const stakeLabels = [...new Set([...STAKES.map((s) => s.label), ...settings.customStakes.map((s) => s.label), settings.usualStakes].filter(Boolean))];

  const save = async (event) => {
    event.preventDefault();
    const year = form.playingSince.trim() === '' ? null : Number(form.playingSince);
    if (year !== null && !(Number.isInteger(year) && year >= 1950 && year <= THIS_YEAR)) return setError(`Enter a year between 1950 and ${THIS_YEAR}.`);
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateSettings({ ...form, playingSince: year }));
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Your profile" className="edit-profile-sheet">
      <form className="edit-profile-form" onSubmit={save}>
        <div className="form-grid">
          <FormField label="Name" htmlFor="profile-name">
            <input id="profile-name" className="form-input" type="text" maxLength={60} autoComplete="name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
          </FormField>
          <FormField label="Nickname" htmlFor="profile-nickname">
            <input id="profile-nickname" className="form-input" type="text" maxLength={40} placeholder="At the table" value={form.nickname} onChange={(e) => set('nickname')(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Home casino or card room" htmlFor="profile-casino">
          <input id="profile-casino" className="form-input" type="text" maxLength={80} placeholder="Where you play most" value={form.homeCasino} onChange={(e) => set('homeCasino')(e.target.value)} />
        </FormField>

        <FormField label="Usual stakes" hint="Picked for you when you start a session.">
          <ChoiceChips options={stakeLabels.map((label) => ({ value: label, label }))} value={form.usualStakes} onChange={set('usualStakes')} label="Usual stakes" />
        </FormField>

        <FormField label="Favorite game" hint="Also picked for you when you start a session.">
          <ChoiceChips options={GAMES} value={form.favoriteGame} onChange={set('favoriteGame')} label="Favorite game" />
        </FormField>

        <FormField label="Playing since" htmlFor="profile-since">
          <input
            id="profile-since"
            className="form-input edit-profile-year"
            type="number"
            inputMode="numeric"
            min="1950"
            max={THIS_YEAR}
            placeholder={String(THIS_YEAR - 5)}
            value={form.playingSince}
            onChange={(e) => set('playingSince')(e.target.value)}
          />
        </FormField>

        {error && (
          <p className="edit-profile-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn edit-profile-save" disabled={saving}>
          <Icon name="check" size={16} /> {saving ? 'Saving' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
