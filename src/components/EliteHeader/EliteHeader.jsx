// Page title for the elite sections (Coach and Practice): a gold crest and "Elite" mark, the title and subtitle on
// a deep panel with a faint grain and a light sheen, and optional actions on the right. Same props as PageHeader.
import './EliteHeader.css';

// The crest: a shield with a spade, drawn in the current color (gold).
function Crest() {
  return (
    <svg className="elite-crest-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 2.5 20 5.5v6.2c0 4.6-3.3 8.4-8 9.8-4.7-1.4-8-5.2-8-9.8V5.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 7.2c1.6 1.9 4 3.2 4 5.2a2 2 0 0 1-3.3 1.5l.5 2.1h-2.4l.5-2.1A2 2 0 0 1 8 12.4c0-2 2.4-3.3 4-5.2z" fill="currentColor" />
    </svg>
  );
}

// kicker: what this section is ("GTO coach"). compact: a slimmer header for while a hand is on the table.
export default function EliteHeader({ title, subtitle, kicker, compact = false, children }) {
  return (
    <header className={`elite-header ${compact ? 'is-compact' : ''}`}>
      <div className="elite-header-main">
        <span className="elite-header-mark">
          <span className="elite-crest">
            <Crest /> Elite
          </span>
          {kicker && <span className="elite-header-kicker">{kicker}</span>}
        </span>
        <h1 className="elite-header-title">{title}</h1>
        {subtitle && <p className="elite-header-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="elite-header-actions">{children}</div>}
    </header>
  );
}
