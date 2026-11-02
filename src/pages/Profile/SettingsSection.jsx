// One section of the Profile screen: a small heading, then its rows in a rounded group (iOS settings style),
// with an optional footnote. Sections fade up one after another when the page opens (order sets the delay).
import './SettingsSection.css';

// plain: the children bring their own cards (the data panels), so no group around them.
export default function SettingsSection({ title, footnote, order = 0, plain = false, className = '', children }) {
  return (
    <section className={`settings-section ${className}`} style={{ '--order': order }} aria-label={title}>
      <h2 className="settings-section-title">{title}</h2>
      {plain ? children : <div className="settings-section-group">{children}</div>}
      {footnote && <p className="settings-section-footnote">{footnote}</p>}
    </section>
  );
}
