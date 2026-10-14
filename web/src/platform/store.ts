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
    let settled = false;
    const timer = setTimeout(() => fail(new Error("IndexedDB: tardó más de 3 s")), 3000);
    function fail(err: unknown): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (err) {
      fail(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      if (settled) {
        req.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new Error("IndexedDB: bloqueada por otra pestaña"));
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
    } catch (err) {
      // IndexedDB no disponible o lenta: se cae al fallback (queda registrado
      // para poder depurar sin consola) y se avisa al usuario en pantalla.
      console.warn("IndexedDB no disponible, uso localStorage:", err);
      reportNotice("Guardado con localStorage (IndexedDB no disponible).");
    }
  }
  if (typeof localStorage !== "undefined") return localStore();
  return memoryStore();
}

function reportNotice(msg: string): void {
  try {
    (window as unknown as { hnBoot?: { notice?: (m: string) => void } }).hnBoot?.notice?.(msg);
  } catch {
    /* sin ventana (tests) */
  }
}
