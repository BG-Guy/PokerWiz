// Theme state (light / dark): shared through React context and saved between visits.
import { createContext, useContext, useEffect, useState } from 'react';

// v2: the black-and-red redesign starts everyone on the night theme once (an older choice is not carried over).
const STORAGE_KEY = 'pokerwiz-theme-v2';
const ThemeContext = createContext(null);

// The saved theme if there is one, otherwise night (black): the app's look.
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be blocked (private mode): fall back to night.
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // Reflect the theme on <html> (CSS tokens key off data-theme) and remember the choice.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not saving is fine; the theme still applies for this visit.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// Hook for components that read or switch the theme.
export function useTheme() {
  return useContext(ThemeContext);
}
