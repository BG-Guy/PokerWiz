// Opens the detailed view of a card: on phones a bottom sheet (Modal) slides up (drag it down to close, up or
// the expand button for full screen); on larger screens the card itself grows into a big panel (ExpandPanel)
// and shrinks back into it on close. Either way, focus returns to the card afterwards.
import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import Modal from '../Modal/Modal.jsx';
import ExpandPanel from './ExpandPanel.jsx';

// originRef: the card that opened it (where the panel grows from, and where focus goes back to).
export default function DetailSheet({ open, onClose, title, originRef, children }) {
  const wide = useMediaQuery('(min-width: 768px)');
  const wasOpen = useRef(open);

  // Back to the card once the view closes, so keyboard users carry on where they were.
  useEffect(() => {
    if (wasOpen.current && !open) originRef?.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, originRef]);

  if (!wide) {
    return (
      <Modal open={open} onClose={onClose} title={title} className="detail-sheet" expandable>
        {children}
      </Modal>
    );
  }
  return (
    <ExpandPanel open={open} onClose={onClose} title={title} originRef={originRef}>
      {children}
    </ExpandPanel>
  );
}
