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

// scope: moneyScope(your sessions), so the result is in the unit they add up in. onOpen(kind) opens the story
// behind one of the three numbers ('sessions' | 'hours' | 'net'); cardRef(kind) marks where it grows from.
export default function ProfileCard({ settings, scope, onEdit, onOpen, cardRef }) {
  const { sessions } = scope;
  const name = settings.name || settings.nickname;
  const initials = initialsOf(name);
  const net = sessions.reduce((sum, s) => sum + sessionProfit(s), 0);
  const hours = sessions.reduce((sum, s) => sum + s.durationMin, 0) / 60;
  const record = [
    { id: 'sessions', label: 'Sessions', value: sessions.length.toLocaleString('en-US') },
    { id: 'hours', label: 'Hours', value: Math.round(hours).toLocaleString('en-US') },
    { id: 'net', label: 'Result', value: <Money amount={scope.inBB ? net : Math.round(net)} bb={scope.bb} /> },
  ];
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

      {/* Your record so far, in three numbers: tap one for its story */}
      {sessions.length > 0 && (
        <div className="profile-card-record">
          {record.map((stat) => (
            <button key={stat.id} type="button" className="profile-card-stat" onClick={() => onOpen(stat.id)} ref={cardRef(stat.id)} aria-haspopup="dialog">
              <span className="profile-card-stat-label">
                {stat.label} <Icon name="chevronRight" size={12} />
              </span>
              <span className="profile-card-stat-value num">{stat.value}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
