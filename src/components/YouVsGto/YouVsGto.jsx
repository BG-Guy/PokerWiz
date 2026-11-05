// You against GTO as two stacked bars: how often you fold, check, call and raise in a kind of spot, over how often
// GTO does with the same hands. The legend under it says the numbers, and when `onPick` is given each entry is a
// button that narrows the list of spots to the ones where you played it.
import './YouVsGto.css';

const LABELS = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise' };
const pct = (x) => `${Math.round(x * 100)}%`;

// you, gto: shares of each play ({ fold, check, call, raise }); kinds: the plays that are on the table here;
// betting: nothing to call, so a raise is a "Bet". active: the picked play (or null); onPick(kind | null).
export default function YouVsGto({ you, gto, kinds, betting = false, active = null, onPick }) {
  const word = (kind) => (kind === 'raise' && betting ? 'Bet' : LABELS[kind]);

  return (
    <div className="you-vs-gto">
      {[
        ['You', you],
        ['GTO', gto],
      ].map(([who, shares]) => (
        <div key={who} className="you-vs-gto-line">
          <span className="you-vs-gto-who">{who}</span>
          <span className="you-vs-gto-bar" role="img" aria-label={`${who}: ${kinds.map((kind) => `${word(kind)} ${pct(shares[kind])}`).join(', ')}`}>
            {kinds
              .filter((kind) => shares[kind] > 0.004)
              .map((kind) => (
                <span key={kind} className={`you-vs-gto-seg is-${kind} ${active && active !== kind ? 'is-dim' : ''}`} style={{ flexGrow: shares[kind] }}>
                  {shares[kind] >= 0.09 ? pct(shares[kind]) : ''}
                </span>
              ))}
          </span>
        </div>
      ))}

      <div className="you-vs-gto-legend">
        {kinds.map((kind) => {
          const content = (
            <>
              <span className={`you-vs-gto-dot is-${kind}`} />
              <span className="you-vs-gto-name">{word(kind)}</span>
              <span className="you-vs-gto-numbers num">
                {pct(you[kind])} <small>vs {pct(gto[kind])}</small>
              </span>
            </>
          );
          if (!onPick) return <span key={kind} className="you-vs-gto-key">{content}</span>;
          return (
            <button key={kind} type="button" className={`you-vs-gto-key is-button ${active === kind ? 'is-active' : ''}`} aria-pressed={active === kind} onClick={() => onPick(active === kind ? null : kind)}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
