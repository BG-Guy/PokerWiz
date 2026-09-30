// Theme state (light / dark): shared through React context and saved between visits.
import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'pokerwiz-theme';
const ThemeContext = createContext(null);

// Pick the saved theme if there is one, otherwise follow the operating system setting.
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be blocked (private mode); fall through to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
