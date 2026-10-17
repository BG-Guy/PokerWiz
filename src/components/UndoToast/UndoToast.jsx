// A short-lived bar at the bottom of the screen ("Hand deleted · Undo") that runs out after a few seconds; a thin
// line shows the time left. onUndo puts things back; onDone runs once the time is up.
import { useEffect } from 'react';
import Icon from '../Icon/Icon.jsx';
import './UndoToast.css';

export default function UndoToast({ message, onUndo, onDone, duration = 5000 }) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  return (
    <div className="undo-toast" role="status">
      <Icon name="trash" size={18} />
      <span className="undo-toast-message">{message}</span>
      <button type="button" className="undo-toast-undo" onClick={onUndo}>
        <Icon name="undo" size={16} /> Undo
      </button>
      <span className="undo-toast-timer" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}
