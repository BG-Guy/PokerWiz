// Vite build configuration: React plugin, a dev proxy that forwards /api to the Express server, and the app's
// version (from package.json), the commit it was built from and when that was, shown in the navigation
// (constants/version.js).
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

// When the build's code was last changed: its commit's date (YYYY-MM-DD), or today when there's no git.
function buildDate() {
  try {
    return execSync('git log -1 --format=%cs', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
    __APP_DATE__: JSON.stringify(buildDate()),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
