// KeyValueStore (T5.1): IndexedDB (base `hn`, store `kv`) con fallback a
// localStorage y, si no hay ninguno, memoria. Claves de "Nombres fijos".

export const KEYS = {
  imported: "hn.imported",
  seenHelp: "hn.seenHelp",
  position: "hn.position",
  month: "hn.month",
  active: "hn.active",
  voyageCurrent: "hn.voyage.current",
  voyageArchive: "hn.voyage.archive",
  nhc: "hn.nhc",
  settings: "hn.settings",
  myRoutes: "hn.myRoutes",
} as const;

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const DB_NAME = "hn";
const STORE = "kv";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbStore(db: IDBDatabase): KeyValueStore {
  const tx = (mode: IDBTransactionMode): IDBObjectStore => db.transaction(STORE, mode).objectStore(STORE);
  return {
    async get(key) {
      const v = await request<unknown>(tx("readonly").get(key));
      return typeof v === "string" ? v : v == null ? null : String(v);
    },
    async put(key, value) {
      tx("readwrite").put(value, key);
    },
    async remove(key) {
      tx("readwrite").delete(key);
    },
  };
}

function localStore(): KeyValueStore {
  return {
    async get(key) {
      return localStorage.getItem(key);
    },
    async put(key, value) {
      localStorage.setItem(key, value);
    },
    async remove(key) {
      localStorage.removeItem(key);
    },
  };
}

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

export async function openStore(): Promise<KeyValueStore> {
  if (typeof indexedDB !== "undefined") {
    try {
      return idbStore(await openDb());
    } catch {
      // sin IndexedDB: se cae al fallback
    }
  }
  if (typeof localStorage !== "undefined") return localStore();
  return memoryStore();
}
