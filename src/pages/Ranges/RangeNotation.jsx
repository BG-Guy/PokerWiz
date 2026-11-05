// A range written the way players write it ("22+, A2s+, KTs+, ATo+"), with a button that copies it, so it can be
// pasted into notes or another tool. `sometimes` lists the hands that only take the action part of the time.
import { useState } from 'react';
import Icon from '../../components/Icon/Icon.jsx';
import './RangeNotation.css';

export default function RangeNotation({ always, sometimes = '' }) {
  const [copied, setCopied] = useState(false);
  const text = sometimes ? `${always}${always ? ', ' : ''}${sometimes}` : always;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked (an insecure page, say): the text is on screen to select by hand. */
    }
  };

  if (!always && !sometimes) return <p className="rg-notation-empty">No hands.</p>;
  return (
    <div className="rg-notation">
      <p className="rg-notation-text">
        {always || 'No hand takes it every time.'}
        {sometimes && (
          <span className="rg-notation-sometimes">
            {' '}
            <span className="rg-notation-tag">sometimes</span> {sometimes}
          </span>
        )}
      </p>
      <button type="button" className={`rg-notation-copy ${copied ? 'is-copied' : ''}`} onClick={copy} aria-label="Copy range">
        <Icon name={copied ? 'check' : 'copy'} size={16} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
