// Entry point: mounts the React app with routing and theme support.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext.jsx';
import { UnitProvider } from './theme/UnitContext.jsx';
import App from './App.jsx';
import './global.css';

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
