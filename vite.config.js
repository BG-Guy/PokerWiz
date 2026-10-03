// Vite build configuration: React plugin, a dev proxy that forwards /api to the Express server, and the app's
// version (from package.json) plus the commit it was built from, shown in the navigation (constants/version.js).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Render sets RENDER_GIT_COMMIT while it builds; locally, ask git. No git at all: no commit shown.
function buildCommit() {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/login': 'http://localhost:3001', // the password lock's login page (server/views/loginPage.js)
    },
  },
});
