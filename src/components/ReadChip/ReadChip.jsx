// A player and what you know about them, as a chip: their seat and their read ("BTN · Calling station"). Tap it
// to set the read (it opens a ReadSheet). A player with no read says so in a quieter tone.
import Icon from '../Icon/Icon.jsx';
import './ReadChip.css';

// role: 'villain' | 'hero'. label: the read ("Calling station · Rec", or "No read"). isSet: there is one.
export default function ReadChip({ position, role = 'villain', label, isSet = false, onClick, disabled = false }) {
  return (
    <button type="button" className={`read-chip ${isSet ? 'is-set' : ''}`} onClick={onClick} disabled={disabled} aria-haspopup="dialog">
      <Icon name={role === 'hero' ? 'hero' : 'villain'} size={15} />
      <span className="read-chip-seat">{position}</span>
      <span className="read-chip-label">{label}</span>
      <Icon name="chevronRight" size={15} className="read-chip-chevron" />
    </button>
  );
}
