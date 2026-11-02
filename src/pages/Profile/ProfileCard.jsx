// The top of Profile: your initials, name and nickname, where you usually play, and your record in three numbers
// (sessions, hours, result). Edit opens the profile sheet.
import { sessionProfit } from '../../utils/stats.js';
import Icon from '../../components/Icon/Icon.jsx';
import Money from '../../components/Money/Money.jsx';
import './ProfileCard.css';

// "Guy Buganim" -> "GB"; one name -> its first two letters.
function initialsOf(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words.at(-1)[0]).toUpperCase();
}

export default function ProfileCard({ settings, sessions, onEdit }) {
  const name = settings.name || settings.nickname;
  const initials = initialsOf(name);
  const net = sessions.reduce((sum, s) => sum + sessionProfit(s), 0);
  const hours = sessions.reduce((sum, s) => sum + s.durationMin, 0) / 60;
  const subline = [settings.name && settings.nickname ? `"${settings.nickname}"` : null, settings.homeCasino].filter(Boolean).join(' · ');

  return (
    <section className="profile-card" aria-label="You">
      <div className="profile-card-who">
        <span className="profile-card-avatar" aria-hidden="true">
          {initials || <Icon name="hero" size={28} />}
        </span>
        <div className="profile-card-names">
          <h2 className={`profile-card-name ${name ? '' : 'is-empty'}`}>{name || 'Your name'}</h2>
          <p className="profile-card-sub">{subline || (name ? 'Add your home casino' : 'Add your details')}</p>
        </div>
        <button type="button" className="profile-card-edit" onClick={onEdit}>
          <Icon name="pencil" size={15} /> Edit
        </button>
      </div>

      {/* Your record so far, in three numbers (the full story lives in History and Insights) */}
      {sessions.length > 0 && (
        <dl className="profile-card-record">
          <div>
            <dt>Sessions</dt>
            <dd className="num">{sessions.length.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd className="num">{Math.round(hours).toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd>
              <Money amount={net} />
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
