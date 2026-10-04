// Practice in full screen: the table fills the screen (no app header or tab bar) and the action panel is docked
// at the bottom, so Fold / Call / Raise are always in view without scrolling. On wide screens (laptops, phones
// held sideways) the hand's log and the panel sit beside the table instead. Phones and tablets also get the
// browser's own full screen (no address bar) where the browser allows it.
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal/Modal.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import PlayingCard from '../../components/PlayingCard/PlayingCard.jsx';
import './PracticeFullScreen.css';

// table, log, dock: what goes in each area (the dock holds the action panel, the grade or the result).
// peek: the current street ({ name, cards, text }), shown over the dock on phones; tap it for the whole log.
// onNext (optional) puts "Next hand" in the top bar.
export default function PracticeFullScreen({ title, subtitle, table, log, peek, dock, nextLabel, onNext, onExit }) {
  const [logOpen, setLogOpen] = useState(false);

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
          <button type="button" className="btn btn-ghost practice-fs-log-btn" onClick={() => setLogOpen(true)} aria-label="The hand so far">
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

      {/* Beside the table on wide screens: the whole log, then the dock. Phones: just the dock, under the table */}
      <div className="practice-fs-side">
        {log && <div className="practice-fs-log">{log}</div>}
        {(peek || dock) && (
          <div className="practice-fs-dock">
            {peek && (
              <button type="button" className="practice-fs-peek" onClick={() => setLogOpen(true)} aria-label={`${peek.name}: ${peek.text}. Show the whole hand.`}>
                <span className="practice-fs-peek-street">{peek.name}</span>
                {peek.cards.length > 0 && (
                  <span className="practice-fs-peek-cards">
                    {peek.cards.map((code) => (
                      <PlayingCard key={code} code={code} size="xs" />
                    ))}
                  </span>
                )}
                <span className="practice-fs-peek-text">{peek.text}</span>
                <Icon name="chevronDown" size={14} />
              </button>
            )}
            {dock}
          </div>
        )}
      </div>

      {log && (
        <Modal open={logOpen} onClose={() => setLogOpen(false)} title="The hand so far">
          {log}
        </Modal>
      )}
    </section>
  );
}
