// Practice in full screen: the table fills the screen (no app header or tab bar) and the action panel is docked
// at the bottom, so Fold / Call / Raise are always in view without scrolling. On wide screens (laptops, phones
// held sideways) the hand's log and the panel sit beside the table instead. Phones and tablets also get the
// browser's own full screen (no address bar) where the browser allows it.
// On phones the whole log is a drawer that slides up out of the street line above the buttons; tapping the
// line again slides it back down (the same animation in reverse).
import { useEffect, useState } from 'react';
import { useClosingValue } from '../../hooks/useClosingValue.js';
import Icon from '../../components/Icon/Icon.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import './PracticeFullScreen.css';

// table, log, dock: what goes in each area (the dock holds the action panel, the grade or the result).
// peek: the current street ({ name, cards, text }), shown over the dock on phones; tap it to open or close the
// whole log.
// onNext (optional) puts "Next hand" in the top bar.
export default function PracticeFullScreen({ title, subtitle, table, log, peek, dock, nextLabel, onNext, onExit }) {
  const [logOpen, setLogOpen] = useState(false);
  const [drawer, drawerOpen] = useClosingValue(logOpen); // the drawer stays up while it slides back down
  const toggleLog = () => setLogOpen((open) => !open);

  // While shown: the page behind doesn't scroll, and touch screens ask the browser for full screen too.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (window.matchMedia('(pointer: coarse)').matches && document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Escape closes the log drawer.
  useEffect(() => {
    if (!logOpen) return undefined;
    const onKey = (event) => event.key === 'Escape' && setLogOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [logOpen]);

  return (
    <section className="practice-fs" aria-label={title}>
      {/* Top bar: leave full screen, which hand this is, the log, and the next hand */}
      <header className="practice-fs-bar">
        <button type="button" className="btn-icon practice-fs-exit" onClick={onExit} aria-label="Exit full screen" title="Exit full screen">
          <Icon name="shrink" size={18} />
        </button>
        <div className="practice-fs-title">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {log && (
          <button type="button" className="btn btn-ghost practice-fs-log-btn" onClick={toggleLog} aria-label="The hand so far" aria-expanded={logOpen}>
            <Icon name="log" size={16} />
            <span className="practice-fs-log-label">Log</span>
          </button>
        )}
        {onNext && (
          <button type="button" className="btn btn-ghost practice-fs-next" onClick={onNext}>
            {nextLabel} <Icon name="chevronRight" size={16} />
          </button>
        )}
      </header>

      <div className="practice-fs-table">{table}</div>

      {/* Phones: the whole log, sliding up out of the street line (tap the dimmed table to close it too) */}
      {drawer && log && (
        <>
          <div className={`practice-fs-scrim ${drawerOpen ? '' : 'is-closing'}`} onClick={() => setLogOpen(false)} aria-hidden="true" />
          <div className="practice-fs-drawer-clip">
            <section id="practice-fs-drawer" className={`practice-fs-drawer ${drawerOpen ? '' : 'is-closing'}`} aria-label="The hand so far">
              <h2 className="practice-fs-drawer-title">The hand so far</h2>
              {log}
            </section>
          </div>
        </>
      )}

      {/* Beside the table on wide screens: the whole log, then the dock. Phones: just the dock, under the table */}
      <div className="practice-fs-side">
        {log && <div className="practice-fs-log">{log}</div>}
        {(peek || dock) && (
          <div className="practice-fs-dock">
            {peek && (
              <button
                type="button"
                className={`practice-fs-peek ${logOpen ? 'is-open' : ''}`}
                onClick={toggleLog}
                aria-expanded={logOpen}
                aria-controls="practice-fs-drawer"
                aria-label={`${peek.name}: ${peek.text}. ${logOpen ? 'Hide' : 'Show'} the whole hand.`}
              >
                <span className="practice-fs-peek-street">{peek.name}</span>
                {peek.cards.length > 0 && (
                  <span className="practice-fs-peek-cards">
                    {peek.cards.map((code) => (
                      <PlayingCard key={code} code={code} size="xs" />
                    ))}
                  </span>
                )}
                <span className="practice-fs-peek-text">{peek.text}</span>
                <Icon name="chevronDown" size={14} className="practice-fs-peek-chevron" />
              </button>
            )}
            {dock}
          </div>
        )}
      </div>
    </section>
  );
}
