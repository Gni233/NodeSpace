export interface WorkbenchCoverCacheKey {
  /** Stable identity of the mounted library (or browser-local storage). */
  scope: string;
  id: string;
  version: string | number;
  theme: string;
}

interface CacheRecord<T> {
  key: string;
  value: T;
  savedAt: number;
}

interface CacheOptions {
  maxEntries?: number;
  factory?: () => IDBFactory;
}

const DATABASE = 'nodespace-workbench-covers';
const STORE = 'covers';
const SAVED_AT = 'savedAt';
const DEFAULT_LIMIT = 512;

const recordKey = ({ scope, id, version, theme }: WorkbenchCoverCacheKey) =>
  JSON.stringify([scope, id, version, theme]);

export function createWorkbenchCoverCache<T>(options: CacheOptions = {}) {
  const { maxEntries = DEFAULT_LIMIT, factory = () => indexedDB } = options;
  const limit = Number.isSafeInteger(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_LIMIT;
  const memory = new Map<string, CacheRecord<T>>();
  const queued = new Map<string, CacheRecord<T>>();
  let database: Promise<IDBDatabase | undefined> | undefined;
  let writer: Promise<void> | undefined;
  let lastSavedAt = 0;

  function addBounded(map: Map<string, CacheRecord<T>>, record: CacheRecord<T>): void {
    map.delete(record.key);
    map.set(record.key, record);
    while (map.size > limit) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }

  function open(): Promise<IDBDatabase | undefined> {
    if (database) return database;
    const pending = new Promise<IDBDatabase | undefined>(resolve => {
      let unavailable = false;
      const fallBack = () => { unavailable = true; resolve(undefined); };
      try {
        const request = factory().open(DATABASE, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex(SAVED_AT, SAVED_AT);
        };
        request.onerror = request.onblocked = fallBack;
        request.onsuccess = () => {
          const db = request.result;
          if (unavailable) { db.close(); return; }
          db.onversionchange = () => {
            db.close();
            if (database === pending) database = undefined;
          };
          resolve(db);
        };
      } catch {
        fallBack();
      }
    });
    database = pending;
    return pending;
  }

  async function read(key: string): Promise<CacheRecord<T> | undefined> {
    const db = await open();
    if (!db) return undefined;
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      tx.oncomplete = () => resolve(request.result as CacheRecord<T> | undefined);
      tx.onerror = tx.onabort = () => resolve(undefined);
    });
  }

  function persist(db: IDBDatabase, records: CacheRecord<T>[]): Promise<void> {
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      const store = tx.objectStore(STORE);
      try {
        for (const record of records) store.put(record);
        const keys = store.index(SAVED_AT).getAllKeys();
        keys.onsuccess = () => {
          // Index order is oldest first. Prune in the write transaction so
          // other windows cannot leave the persistent store over capacity.
          const excess = keys.result.length - limit;
          for (let index = 0; index < excess; index++) store.delete(keys.result[index]);
        };
      } catch {
        tx.abort();
      }
    });
  }

  function scheduleWrite(): void {
    if (writer) return;
    writer = Promise.resolve().then(async () => {
      while (queued.size) {
        const db = await open();
        if (!db) { queued.clear(); break; }
        const batch = [...queued.values()];
        queued.clear();
        try { await persist(db, batch); } catch { /* Cache failure leaves the memory copy available. */ }
      }
    }).finally(() => {
      writer = undefined;
      if (queued.size) scheduleWrite();
    });
  }

  return {
    async get(key: WorkbenchCoverCacheKey): Promise<T | undefined> {
      const identity = recordKey(key);
      const memoryRecord = memory.get(identity);
      if (memoryRecord) {
        addBounded(memory, memoryRecord);
        return memoryRecord.value;
      }
      try {
        const record = await read(identity);
        // A set may have arrived while the database read was in flight.
        const current = memory.get(identity) ?? record;
        if (current) addBounded(memory, current);
        return current?.value;
      } catch {
        return memory.get(identity)?.value;
      }
    },

    set(key: WorkbenchCoverCacheKey, value: T): void {
      lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
      const record = { key: recordKey(key), value, savedAt: lastSavedAt };
      addBounded(memory, record);
      addBounded(queued, record);
      scheduleWrite();
    },

    async flush(): Promise<void> {
      while (writer) await writer;
    },
  };
}
