/* Tiny promise wrapper around IndexedDB — used for the device uuid, the offline
   task cache and the local (server-less) sync engine. */
import type { Task } from "./types";

const DB_NAME = "vervox";
const DB_VERSION = 3;
export const STORE_META = "meta";
export const STORE_TASKS = "tasks";
export const STORE_ARCHIVE = "archive";
export const STORE_MEDIA = "media";
export const STORE_SYNC = "pending_sync_queue";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_TASKS)) db.createObjectStore(STORE_TASKS, { keyPath: "task_id" });
      if (!db.objectStoreNames.contains(STORE_ARCHIVE)) db.createObjectStore(STORE_ARCHIVE, { keyPath: "task_id" });
      if (!db.objectStoreNames.contains(STORE_MEDIA)) db.createObjectStore(STORE_MEDIA, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_SYNC)) db.createObjectStore(STORE_SYNC, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      })
  );
}

export const idbGet = <T>(store: string, key: IDBValidKey) => tx<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbGetAll = <T>(store: string) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const idbPut = (store: string, value: unknown, key?: IDBValidKey) =>
  tx(store, "readwrite", (s) =>
    (key === undefined ? s.put(value as never) : s.put(value as never, key)) as IDBRequest<IDBValidKey>
  );
export const idbDelete = (store: string, key: IDBValidKey) => tx(store, "readwrite", (s) => s.delete(key) as IDBRequest<undefined>);
export const idbClear = (store: string) => tx(store, "readwrite", (s) => s.clear() as IDBRequest<undefined>);

export const metaGet = async <T>(key: string): Promise<T | undefined> => idbGet<T>(STORE_META, key);
export const metaSet = (key: string, value: unknown) => idbPut(STORE_META, value, key);

export const cacheTasks = async (tasks: Task[]) => {
  try {
    const db = await openDb();
    const t = db.transaction(STORE_TASKS, "readwrite");
    const store = t.objectStore(STORE_TASKS);
    await new Promise<void>((resolve) => {
      const clear = store.clear();
      clear.onsuccess = () => resolve();
      clear.onerror = () => resolve();
    });
    for (const task of tasks) store.put(task);
    await new Promise<void>((resolve) => {
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    });
  } catch {
    /* cache is best-effort */
  }
};

/* Media blobs (offline / local engine) — keyed `idb:<id>` inside task.media. */
export interface MediaRecord {
  id: string;
  blob: Blob;
  type: string;
  created_at: number;
}

export const putMedia = (id: string, blob: Blob) =>
  idbPut(STORE_MEDIA, { id, blob, type: blob.type, created_at: Date.now() } satisfies MediaRecord);

export const getMedia = (id: string) => idbGet<MediaRecord>(STORE_MEDIA, id);

export const readCachedTasks = async (): Promise<Task[]> => {
  try {
    return await idbGetAll<Task>(STORE_TASKS);
  } catch {
    return [];
  }
};
