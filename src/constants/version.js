// The app's version (package.json "version"), the commit it was built from and that commit's date
// (YYYY-MM-DD), injected by vite.config.js. Outside a Vite build (e.g. scripts run with node) they fall back to
// "dev", no commit and no date.
/* global __APP_VERSION__, __APP_COMMIT__, __APP_DATE__ */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : '';
export const APP_DATE = typeof __APP_DATE__ === 'string' ? __APP_DATE__ : '';
