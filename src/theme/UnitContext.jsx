// Money display unit (big blinds or dollars): shared through React context and saved between visits.
// Big blinds are the default. formatMoney reads the unit, so every screen follows the switch.
import { createContext, useContext, useEffect, useState } from 'react';
import { setMoneyUnit } from '../utils/format.js';

const STORAGE_KEY = 'pokerwiz-unit';
const UnitContext = createContext(null);

function getInitialUnit() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '$' ? '$' : 'bb';
  } catch {
    return 'bb'; // storage blocked: use the default
  }
}

export function UnitProvider({ children }) {
  const [unit, setUnit] = useState(getInitialUnit);
  // Set before anything below renders, so the first paint already uses the right unit.
  setMoneyUnit(unit);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, unit);
    } catch {
      // Not saving is fine; the unit still applies for this visit.
    }
  }, [unit]);

  const toggleUnit = () => setUnit((current) => (current === 'bb' ? '$' : 'bb'));
  return <UnitContext.Provider value={{ unit, setUnit, toggleUnit }}>{children}</UnitContext.Provider>;
}

// Components that depend on the unit call this, so they re-render when it changes.
export function useUnit() {
  return useContext(UnitContext);
}
