// App shell: navigation (sidebar on desktop, bottom tabs on mobile) plus the active page.
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from '../NavBar/NavBar.jsx';
import Brand from '../Brand/Brand.jsx';
import ThemeToggle from '../ThemeToggle/ThemeToggle.jsx';
import UnitToggle from '../UnitToggle/UnitToggle.jsx';
import './AppLayout.css';

export default function AppLayout() {
  const { pathname } = useLocation();

  // Start each page at the top when switching sections.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app-layout">
      <NavBar />

      <div className="app-column">
        {/* Mobile-only top bar: the sidebar (with brand, BB/$ and theme switches) is hidden on phones */}
        <header className="app-mobile-header">
          <Brand />
          <span className="app-mobile-header-tools">
            <UnitToggle />
            <ThemeToggle />
          </span>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
