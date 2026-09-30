/** Minimal promise wrapper over IndexedDB. One database, named object stores, keyed by string. */

const DB_NAME = 'beze';
const DB_VERSION = 1;
export const STORES = { projects: 'projects', blobs: 'blobs' } as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of Object.values(STORES)) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function request<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const idb = {
  get: <T>(store: string, key: string) => request<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  getAll: <T>(store: string) => request<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: (store: string, key: string, value: unknown) => request<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key)),
  delete: (store: string, key: string) => request<undefined>(store, 'readwrite', (s) => s.delete(key)),
};
