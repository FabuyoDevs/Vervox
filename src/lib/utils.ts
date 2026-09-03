import type { Priority, Task } from "./types";

export const uid = (prefix = "id"): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const deviceUuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dv-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

/** Local (not UTC) YYYY-MM-DD */
export const todayKey = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const nowTime = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const addDays = (key: string, days: number): string => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return todayKey(date);
};

export const prettyDate = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayKey();
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

export const prettyGroup = (key: string): string => {
  const today = todayKey();
  if (key < today) return "Overdue";
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key <= addDays(today, 7)) return "Next 7 days";
  return "Later";
};

export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-rose-50 text-rose-700 ring-rose-200",
  normal: "bg-sky-50 text-sky-700 ring-sky-200",
  low: "bg-slate-100 text-slate-500 ring-slate-200",
};

export const sortTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    const at = a.schedule?.time ?? "99:99";
    const bt = b.schedule?.time ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    const ap = PRIORITY_ORDER[a.priority];
    const bp = PRIORITY_ORDER[b.priority];
    if (ap !== bp) return ap - bp;
    return a.order - b.order;
  });

/** Scheduled-queue ordering: date first, then time, then priority. */
export const sortByDateTime = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    const ad = a.schedule?.date ?? "9999-12-31";
    const bd = b.schedule?.date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.schedule?.time ?? "99:99";
    const bt = b.schedule?.time ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order;
  });

export const progressOf = (tasks: Task[]) => {
  const total = tasks.length;
  const done = tasks.filter((t) => t.is_completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/* ----------------------------- Quiet hours ----------------------------- */

export interface QuietHours {
  enabled: boolean;
  start: string; // HH:mm
  end: string; // HH:mm
}

export const QUIET_KEY = "vervox:quiet-hours";
export const DEFAULT_QUIET: QuietHours = { enabled: false, start: "22:00", end: "07:00" };

export const loadQuietHours = (): QuietHours => {
  try {
    const raw = localStorage.getItem(QUIET_KEY);
    if (!raw) return DEFAULT_QUIET;
    return { ...DEFAULT_QUIET, ...(JSON.parse(raw) as Partial<QuietHours>) };
  } catch {
    return DEFAULT_QUIET;
  }
};

export const saveQuietHours = (q: QuietHours) => localStorage.setItem(QUIET_KEY, JSON.stringify(q));

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** True when `now` falls inside the (possibly overnight) quiet window. */
export const inQuietHours = (q: QuietHours, now: Date = new Date()): boolean => {
  if (!q.enabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(q.start);
  const end = toMinutes(q.end);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
};

/** Vervox pair codes look like TASK-8F2A */
export const makePairCode = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `TASK-${out}`;
};

/** Pod invites look like POD-8F2A (codes are namespaced so they can't collide). */
export const makePodCode = (): string => `POD-${makePairCode().replace("TASK-", "")}`;

export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
};
