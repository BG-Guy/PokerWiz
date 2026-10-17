// Entry point: mounts the React app with routing and theme support.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext.jsx';
import { UnitProvider } from './theme/UnitContext.jsx';
import App from './App.jsx';
import './global.css';

// No pinch zoom: Safari ignores user-scalable=no in the viewport tag, so its pinch gesture is stopped here
// (double-tap zoom is off through touch-action in global.css). The app sizes itself for every screen.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (event) => event.preventDefault(), { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <UnitProvider>
          <App />
        </UnitProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
