// localStorage wrappers: storage can be unavailable (private mode, blocked
// site data), and the playground must keep working without it.
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore: persistence is a convenience only.
  }
}

// Big canvases (pasted images are stored inline as data URLs) outgrow
// localStorage's few megabytes. The canvas then goes to IndexedDB, and a small
// marker in localStorage says where it is.

const DB = '@octonote/octodraw';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const MARKER = (key: string) => `${key}.in-idb`;

/** Saves a large value: localStorage when it fits, IndexedDB otherwise. Returns where it went. */
export async function saveLarge(key: string, value: string): Promise<'local' | 'idb' | 'failed'> {
  try {
    localStorage.setItem(key, value);
    localStorage.removeItem(MARKER(key));
    return 'local';
  } catch {
    try {
      await idb('readwrite', (s) => s.put(value, key));
      localStorage.removeItem(key);
      localStorage.setItem(MARKER(key), '1');
      return 'idb';
    } catch {
      return 'failed';
    }
  }
}

/** Whether the value lives in IndexedDB (load it with loadLarge). */
export const inIndexedDb = (key: string) => load(MARKER(key)) === '1';

export async function loadLarge(key: string): Promise<string | null> {
  if (!inIndexedDb(key)) return load(key);
  try {
    return (await idb<string | undefined>('readonly', (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}
