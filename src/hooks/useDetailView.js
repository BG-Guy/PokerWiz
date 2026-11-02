// Which card's detailed view is open, plus a ref to that card (where the view grows from and where focus
// returns). The last opened key is kept while the view animates closed, so its content doesn't vanish early.
import { useMemo, useRef, useState } from 'react';

export function useDetailView() {
  const [openKey, setOpenKey] = useState(null);
  const [shownKey, setShownKey] = useState(null);
  const cards = useRef({});

  // A ref-like object that always points at the card of the view being shown.
  const originRef = useMemo(() => ({ get current() { return cards.current[shownKey] ?? null; } }), [shownKey]);

  return {
    openKey,
    shownKey,
    originRef,
    // ref={cardRef('net')} on each card.
    cardRef: (key) => (element) => {
      cards.current[key] = element;
    },
    open: (key) => {
      setOpenKey(key);
      setShownKey(key);
    },
    close: () => setOpenKey(null),
  };
}
