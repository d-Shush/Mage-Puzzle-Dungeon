import type { SavedMapsBackend, SavedMapsRecord } from '../core/savedMaps';

const DB_NAME = 'mage-puzzle-dungeon';
const STORE = 'kv';
const KEY = 'saved-maps';
const FALLBACK_KEY = 'mage-puzzle-dungeon:saved-maps';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked'));
  });
}

/**
 * Saved maps go in IndexedDB: room images make each copy large, and
 * IndexedDB has far more room than localStorage, which the working map's
 * autosave needs for itself.
 */
class IndexedDbBackend implements SavedMapsBackend {
  constructor(private readonly db: IDBDatabase) {}

  read(): Promise<unknown> {
    return request(this.db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY));
  }

  write(record: SavedMapsRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Write aborted'));
    });
  }
}

/** Used when IndexedDB is unavailable (some private modes). */
const localStorageBackend: SavedMapsBackend = {
  async read() {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) : undefined;
  },
  async write(record) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(record));
  },
};

export async function openSavedMapsBackend(): Promise<SavedMapsBackend> {
  // Ask the browser not to evict this site's data under storage pressure.
  void navigator.storage?.persist?.().catch(() => false);
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
    return new IndexedDbBackend(await openDb());
  } catch {
    return localStorageBackend;
  }
}
