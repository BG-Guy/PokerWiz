// Running PokerWiz as an app: added to the Home Screen it opens full screen, with no browser bars, address or
// zoom. iOS only allows that through Safari's Share > Add to Home Screen, so in the browser a small banner offers
// the steps (InstallBanner, dismissed for two weeks), and the More sheet has the same guide (InstallButton).
// Browsers that can install directly (Chrome, Edge, Android) get an Install button instead.
import { useEffect, useState } from 'react';
import Modal from '../Modal/Modal.jsx';
import Icon from '../Icon/Icon.jsx';
import './InstallGuide.css';

const DISMISSED_KEY = 'pokerwiz-install-dismissed';
const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
const isStandalone = () => navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// The browser's own install prompt, when it offers one (saved for the Install button).
let installPrompt = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  listeners.forEach((listener) => listener());
});

// { canInstall, ios } for this browser; canInstall is false once it runs as an app.
function useInstall() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const listener = () => refresh((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  if (isStandalone()) return { canInstall: false, ios: false };
  return { canInstall: isIos() || installPrompt !== null, ios: isIos() };
}

// The steps (iOS), or the browser's own install dialog.
function InstallSheet({ open, onClose }) {
  const { ios } = useInstall();
  async function install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Use PokerWiz as an app">
      <p className="install-sheet-intro">It opens full screen from its own icon: no browser bars, no address, no zooming. Your data stays the same.</p>
      {ios ? (
        <ol className="install-sheet-steps">
          <li>
            <span className="install-sheet-step-icon">
              <Icon name="share" size={20} />
            </span>
            <span>
              In Safari, tap <strong>Share</strong> (at the bottom, or next to the address)
            </span>
          </li>
          <li>
            <span className="install-sheet-step-icon">
              <Icon name="plusSquare" size={20} />
            </span>
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>
            </span>
          </li>
          <li>
            <span className="install-sheet-step-icon">
              <img src="/apple-touch-icon.png" alt="" width={22} height={22} />
            </span>
            <span>
              Open <strong>PokerWiz</strong> from your Home Screen from now on
            </span>
          </li>
        </ol>
      ) : (
        <button type="button" className="btn install-sheet-install" onClick={install}>
          <Icon name="download" size={16} /> Install PokerWiz
        </button>
      )}
    </Modal>
  );
}

// Banner at the top of the app in a browser that could run it as an app.
export function InstallBanner() {
  const { canInstall } = useInstall();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) ?? 0) < TWO_WEEKS;
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // storage blocked: hidden until the next visit
    }
    setDismissed(true);
  };
  if (!canInstall || dismissed) return null;
  return (
    <>
      <div className="install-banner">
        <img src="/apple-touch-icon.png" alt="" width={36} height={36} />
        <button type="button" className="install-banner-text" onClick={() => setOpen(true)}>
          <strong>Use PokerWiz as an app</strong>
          <span>Full screen, no browser bars. Tap to see how.</span>
        </button>
        <button type="button" className="install-banner-close" onClick={dismiss} aria-label="Not now">
          <Icon name="close" size={16} />
        </button>
      </div>
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// "Install the app" row for the More sheet (nothing once it runs as an app).
export function InstallButton({ className = '' }) {
  const { canInstall } = useInstall();
  const [open, setOpen] = useState(false);
  if (!canInstall) return null;
  return (
    <>
      <button type="button" className={`install-button ${className}`} onClick={() => setOpen(true)}>
        <img src="/apple-touch-icon.png" alt="" width={28} height={28} />
        <span>Use PokerWiz as an app</span>
        <Icon name="chevronRight" size={18} />
      </button>
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
