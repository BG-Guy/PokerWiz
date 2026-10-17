// A copy of your data kept in this browser (IndexedDB), refreshed while you use the app (components/DataGuard).
// If the server ever comes back without your data (an update on a host without a lasting disk starts over with
// the sample data), this copy can put it back. One copy per browser: { savedAt, counts, backup }.
const DB_NAME = 'pokerwiz-device-backup';
const STORE = 'copies';
const KEY = 'latest';

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Run one request on the store and resolve with its result.
async function withStore(mode, work) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// The copy on this device, or null (none yet, or the browser doesn't allow storage).
export async function readDeviceCopy() {
  try {
    return (await withStore('readonly', (store) => store.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

// Keep `backup` (with counts: { sessions, hands, goals } of your own data) as this device's copy.
export async function saveDeviceCopy(backup, counts) {
  try {
    const copy = { savedAt: new Date().toISOString(), counts, backup };
    await withStore('readwrite', (store) => store.put(copy, KEY));
    return copy;
  } catch {
    return null;
  }
}

export const totalOf = (counts) => (counts ? counts.sessions + counts.hands + counts.goals : 0);
