// The app's version (package.json "version") and the commit it was built from, injected by vite.config.js.
// Outside a Vite build (e.g. scripts run with node) they fall back to "dev" and no commit.
/* global __APP_VERSION__, __APP_COMMIT__ */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : '';
