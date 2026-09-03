/* Offline write queue.
   ------------------------------------------------------------------
   When the browser is offline (or a Firestore write fails for any reason)
   task mutations are queued in IndexedDB under `pending_sync_queue`. As soon
   as the browser reports "online" again — or the visible tab regains focus —
   the queue is drained in insertion order against the live backend.
   ------------------------------------------------------------------ */

import { idbGetAll, idbPut, idbDelete, STORE_SYNC } from "./idb";
import type { Task } from "./types";
import { uid as makeId } from "./utils";

export type SyncOp =
  | { kind: "upsert"; task: Task }
  | { kind: "patch"; id: string; patch: Partial<Task> }
  | { kind: "delete"; id: string };

export interface SyncEntry {
  id: string;
  createdAt: number;
  attempts: number;
  op: SyncOp;
}

let flushing = false;

export const enqueue = async (op: SyncOp) => {
  const entry: SyncEntry = { id: makeId("sync"), createdAt: Date.now(), attempts: 0, op };
  await idbPut(STORE_SYNC, entry);
  return entry;
};

export const listQueue = async (): Promise<SyncEntry[]> => {
  try {
    const rows = await idbGetAll<SyncEntry>(STORE_SYNC);
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
};

export const queueSize = async (): Promise<number> => (await listQueue()).length;

export const removeEntry = (id: string) => idbDelete(STORE_SYNC, id);

export interface SyncTarget {
  upsertTask(task: Task): Promise<void>;
  patchTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;
}

/** Drains the queue against the live backend; safe to call concurrently. */
export async function flushQueue(target: SyncTarget): Promise<{ synced: number; remaining: number }> {
  if (flushing) return { synced: 0, remaining: await queueSize() };
  flushing = true;
  let synced = 0;
  try {
    const entries = await listQueue();
    for (const entry of entries) {
      try {
        if (entry.op.kind === "upsert") await target.upsertTask(entry.op.task);
        else if (entry.op.kind === "patch") await target.patchTask(entry.op.id, entry.op.patch);
        else await target.deleteTask(entry.op.id);
        await removeEntry(entry.id);
        synced += 1;
      } catch (err) {
        // Stop on first failure so ordering is preserved.
        entry.attempts += 1;
        await idbPut(STORE_SYNC, entry);
        console.warn("[vervox] queued sync failed, will retry", err);
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { synced, remaining: await queueSize() };
}
