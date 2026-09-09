/* Vervox sync engine.
   ------------------------------------------------------------------
   Two interchangeable backends behind one interface:

   1. `firebase` — Cloud Firestore + Firebase Anonymous Auth, loaded from the
      official CDN at runtime (so the bundle stays tiny). Activates as soon as a
      project config is present (VITE_FIREBASE_* env vars, or pasted in Settings).
   2. `local`   — offline-first engine on IndexedDB + BroadcastChannel that
      implements the exact same contract (including OTP codes, 15-minute expiry
      and rate limiting), so the app is fully usable with zero configuration.
   ------------------------------------------------------------------ */
import { computeEntitlements, DEFAULT_FREE_PURCHASES, loadPurchases, savePurchases } from "./billing";
import { envPair } from "./env";
import { cacheTasks, idbDelete, idbGetAll, idbPut, metaGet, metaSet, STORE_TASKS } from "./idb";
import { blobToDataUrl, compressImageToDataUrl } from "./media";
import { resolveHardwareId, setLockedUsername } from "./vault";
import {
  POD_MAX_MEMBERS,
  type BackendMode,
  type Nudge,
  type PairCode,
  type Pod,
  type PodMember,
  type Purchase,
  type Task,
} from "./types";
import { deviceUuid, makePairCode, makePodCode, uid as makeId } from "./utils";

const FIREBASE_VERSION = "11.0.2";
const cdn = (mod: string) => `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-${mod}.js`;
const PAIR_TTL_MS = 5 * 60 * 1000; // 5 minutes, per request
const MAX_ATTEMPTS = 3;
const LOCK_MS = 5 * 60 * 1000;

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}

export interface Backend {
  mode: BackendMode;
  deviceId: string;
  uid: string | null;
  /** uid of the paired partner, known after the pairing snapshot lands. */
  partnerUid: string | null;
  /** Refreshes the current partner UID after pairing or before shared writes. */
  refreshPartnerUid(): Promise<string | null>;
  subscribeTasks(cb: (tasks: Task[]) => void): () => void;
  subscribePartners(cb: (partners: string[]) => void): () => void;
  upsertTask(task: Task): Promise<void>;
  patchTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  createPairCode(): Promise<PairCode>;
  redeemPairCode(code: string): Promise<string>;
  unpair(): Promise<void>;
  /** Issues a `TASK-` (pair) or `POD-` (pod) single-use invite. */
  createInvite(kind: "pair" | "pod", podId: string | null): Promise<PairCode>;
  /** Group pods — shared workspaces for 3–6 device UUIDs. */
  createPod(name: string, memberName: string): Promise<{ pod: Pod; code: PairCode }>;
  joinPod(code: string, memberName: string): Promise<Pod>;
  leavePod(podId: string): Promise<void>;
  subscribePods(cb: (pods: Pod[]) => void): () => void;
  setDisplayName(name: string): Promise<void>;
  /** Monetisation — purchases mirror into Firestore `users/{uid}`. */
  subscribeEntitlements(cb: (purchases: Purchase[]) => void): () => void;
  savePurchases(purchases: Purchase[]): Promise<void>;
  /** Firebase Storage upload (local engine writes blobs to IndexedDB). */
  uploadMedia(blob: Blob, kind: "image" | "voice"): Promise<string>;
  deleteMedia(url: string): Promise<void>;
  /** Partner / pod nudges delivered as native notifications. */
  sendNudge(nudge: { task_id: string; task_title: string; to: string[] }): Promise<void>;
  subscribeNudges(cb: (nudge: Nudge) => void): () => void;
}

export class PairError extends Error {
  constructor(
    message: string,
    public reason: "not_found" | "expired" | "rate_limited" | "self" | "offline" = "not_found"
  ) {
    super(message);
    this.name = "PairError";
  }
}

/* ------------------------------------------------------------------ */
/* Environment / config                                                 */
/* ------------------------------------------------------------------ */

/* Firebase credentials are read from environment variables only — see .env.
   No keys are hardcoded, and nothing is editable from the client UI. */
export function envConfig(): FirebaseConfig | null {
  const cfg = {
    apiKey: envPair("FIREBASE_API_KEY"),
    authDomain: envPair("FIREBASE_AUTH_DOMAIN"),
    projectId: envPair("FIREBASE_PROJECT_ID"),
    storageBucket: envPair("FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: envPair("FIREBASE_MESSAGING_SENDER_ID"),
    appId: envPair("FIREBASE_APP_ID"),
    measurementId: envPair("FIREBASE_MEASUREMENT_ID") || undefined,
  };
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
  return cfg as FirebaseConfig;
}

export const activeConfig = (): FirebaseConfig | null => envConfig();

/* ------------------------------------------------------------------ */
/* Device identity (crypto-random UUID persisted in IndexedDB)          */
/* ------------------------------------------------------------------ */

export async function resolveDeviceId(): Promise<string> {
  // `?as=device-b` opens a second *simulated* device (session scoped) so the
  // pairing flow can be demoed on one machine.
  try {
    const as = new URLSearchParams(location.search).get("as");
    if (as) {
      const key = `vervox:device:${as}`;
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = `hw_${deviceUuid()}`;
        sessionStorage.setItem(key, id);
      }
      return id;
    }
  } catch {
    /* sessionStorage blocked */
  }
  return resolveHardwareId();
}

export function secondDeviceUrl(): string {
  const url = new URL(location.href);
  url.searchParams.set("as", "device-b");
  return url.toString();
}

/* ------------------------------------------------------------------ */
/* Rate limiting: block after 3 incorrect pair-code entries             */
/* ------------------------------------------------------------------ */

export interface RateState {
  attempts: number;
  lockedUntil: number;
}

export const getRateState = (): RateState => {
  try {
    const raw = localStorage.getItem("vervox:pair-rate");
    if (raw) return JSON.parse(raw) as RateState;
  } catch {
    /* ignore */
  }
  return { attempts: 0, lockedUntil: 0 };
};

const setRateState = (s: RateState) => localStorage.setItem("vervox:pair-rate", JSON.stringify(s));

export const resetRateLimit = () => setRateState({ attempts: 0, lockedUntil: 0 });

export const rateLockRemaining = (): number => Math.max(0, getRateState().lockedUntil - Date.now());

function registerFailure(): never {
  const s = getRateState();
  const attempts = s.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : s.lockedUntil;
  setRateState({ attempts, lockedUntil });
  throw new PairError(
    attempts >= MAX_ATTEMPTS
      ? `Too many incorrect codes. Pairing locked for ${Math.ceil(LOCK_MS / 60000)} minutes.`
      : `Incorrect code. ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? "" : "s"} left before lockout.`,
    attempts >= MAX_ATTEMPTS ? "rate_limited" : "not_found"
  );
}

/* ------------------------------------------------------------------ */
/* Local backend                                                        */
/* ------------------------------------------------------------------ */

const LS_CODES = "vervox:pair_codes";
const CHANNEL = "vervox-sync";

type CodeRecord = {
  code: string;
  created_by: string;
  created_uid: string | null;
  expires_at: number;
  kind: "pair" | "pod";
  pod_id: string | null;
};
type CodeMap = Record<string, CodeRecord>;

const readCodes = (): CodeMap => {
  try {
    return JSON.parse(localStorage.getItem(LS_CODES) ?? "{}") as CodeMap;
  } catch {
    return {};
  }
};
const writeCodes = (map: CodeMap) => localStorage.setItem(LS_CODES, JSON.stringify(map));

const partnerKey = (deviceId: string) => `vervox:partner:${deviceId}`;
const getPartner = (deviceId: string): string | null => localStorage.getItem(partnerKey(deviceId));
const setPartner = (deviceId: string, partner: string | null) => {
  if (partner) localStorage.setItem(partnerKey(deviceId), partner);
  else localStorage.removeItem(partnerKey(deviceId));
};

/* ---- Pods (3–6 member workspaces) ---- */
const LS_PODS = "vervox:pods";
const myPodsKey = (deviceId: string) => `vervox:mypods:${deviceId}`;
const nameKey = (deviceId: string) => `vervox:name:${deviceId}`;

export const displayName = (deviceId: string): string => {
  try {
    const rawVault = localStorage.getItem("sys_secure_vault");
    if (rawVault) {
      const parsed = JSON.parse(rawVault);
      if (parsed.vervox_hardware_id === deviceId && parsed.username) {
        return parsed.username;
      }
    }
  } catch {
    /* ignore */
  }
  return localStorage.getItem(nameKey(deviceId)) ?? "";
};

const readPods = (): Record<string, Pod> => {
  try {
    return JSON.parse(localStorage.getItem(LS_PODS) ?? "{}") as Record<string, Pod>;
  } catch {
    return {};
  }
};
const writePods = (pods: Record<string, Pod>) => localStorage.setItem(LS_PODS, JSON.stringify(pods));

const readMyPods = (deviceId: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(myPodsKey(deviceId)) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const writeMyPods = (deviceId: string, ids: string[]) => localStorage.setItem(myPodsKey(deviceId), JSON.stringify(ids));

class LocalBackend implements Backend {
  mode: BackendMode = "local";
  uid: string | null = null;
  partnerUid: string | null = null;
  private taskSubs = new Set<(tasks: Task[]) => void>();
  private partnerSubs = new Set<(partners: string[]) => void>();
  private podSubs = new Set<(pods: Pod[]) => void>();
  private nudgeSubs = new Set<(nudge: Nudge) => void>();
  private entSubs = new Set<(purchases: Purchase[]) => void>();
  private channel: BroadcastChannel | null = null;

  constructor(public deviceId: string) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type?: string };
        if (msg?.type === "tasks") void this.emitTasks();
        if (msg?.type === "partners") {
          this.emitPartners();
          this.emitPods();
        }
        if (msg?.type === "nudge") {
          const nudge = (msg as { nudge?: Nudge }).nudge;
          if (nudge && nudge.to.includes(this.deviceId)) this.nudgeSubs.forEach((cb) => cb(nudge));
        }
      };
    }
    // Periodic sweep so expired codes vanish without user interaction.
    window.setInterval(() => {
      const map = readCodes();
      const now = Date.now();
      let changed = false;
      for (const [code, rec] of Object.entries(map)) {
        if (rec.expires_at < now) {
          delete map[code];
          changed = true;
        }
      }
      if (changed) writeCodes(map);
    }, 30_000);
  }

  private async emitTasks() {
    let tasks: Task[] = [];
    try {
      tasks = await idbGetAll<Task>(STORE_TASKS);
    } catch {
      tasks = [];
    }
    const visible = tasks
      .filter((t) => t.assigned_to?.includes(this.deviceId))
      .map((t) => ({ scope: "personal" as const, ...t }));
    void cacheTasks(visible);
    this.taskSubs.forEach((cb) => cb(visible));
  }

  private emitPartners() {
    const p = getPartner(this.deviceId);
    this.partnerSubs.forEach((cb) => cb(p ? [p] : []));
  }

  private broadcast(type: "tasks" | "partners") {
    this.channel?.postMessage({ type });
  }

  async refreshPartnerUid() {
    this.partnerUid = null;
    return null;
  }

  subscribeTasks(cb: (tasks: Task[]) => void) {
    this.taskSubs.add(cb);
    void this.emitTasks();
    return () => this.taskSubs.delete(cb);
  }

  subscribePartners(cb: (partners: string[]) => void) {
    this.partnerSubs.add(cb);
    this.emitPartners();
    return () => this.partnerSubs.delete(cb);
  }

  async upsertTask(task: Task) {
    const fullTask: Task = {
      ...task,
      creator_id: task.creator_id || this.deviceId,
      creator_username: task.creator_username || displayName(this.deviceId) || "User",
      creator_hardware_id: task.creator_hardware_id || this.deviceId,
    };
    await idbPut(STORE_TASKS, fullTask);
    this.broadcast("tasks");
    await this.emitTasks();
  }

  async patchTask(id: string, patch: Partial<Task>) {
    const all = await idbGetAll<Task>(STORE_TASKS);
    const current = all.find((t) => t.task_id === id);
    if (!current) return;
    await idbPut(STORE_TASKS, { ...current, ...patch, updated_at: Date.now() });
    this.broadcast("tasks");
    await this.emitTasks();
  }

  async deleteTask(id: string) {
    await idbDelete(STORE_TASKS, id);
    this.broadcast("tasks");
    await this.emitTasks();
  }

  /* -------------------------- nudges -------------------------- */

  async sendNudge(nudge: { task_id: string; task_title: string; to: string[] }) {
    const payload: Nudge = {
      id: makeId("nudge"),
      task_id: nudge.task_id,
      task_title: nudge.task_title,
      from_device: this.deviceId,
      from_name: displayName(this.deviceId) || "Your partner",
      to: nudge.to.filter((id) => id !== this.deviceId),
      created_at: Date.now(),
    };
    this.channel?.postMessage({ type: "nudge", nudge: payload });
  }

  subscribeNudges(cb: (nudge: Nudge) => void) {
    this.nudgeSubs.add(cb);
    return () => this.nudgeSubs.delete(cb);
  }

  /* ------------------------- pairing ------------------------- */

  async createPairCode(): Promise<PairCode> {
    return this.createInvite("pair", null);
  }

  async createInvite(kind: "pair" | "pod", podId: string | null): Promise<PairCode> {
    const map = readCodes();
    const code = kind === "pod" ? makePodCode() : makePairCode();
    const expires_at = Date.now() + PAIR_TTL_MS;
    map[code] = { code, created_by: this.deviceId, created_uid: null, expires_at, kind, pod_id: podId };
    writeCodes(map);
    return { code, created_by: this.deviceId, expires_at, kind, pod_id: podId };
  }

  private async consumeCode(code: string): Promise<CodeRecord> {
    const lock = getRateState();
    if (lock.lockedUntil > Date.now()) throw new PairError("Pairing temporarily locked. Try again shortly.", "rate_limited");
    const map = readCodes();
    const rec = map[code];
    if (!rec) registerFailure();
    if (rec.expires_at < Date.now()) {
      delete map[code];
      writeCodes(map);
      registerFailure();
    }
    return rec;
  }

  async redeemPairCode(rawCode: string): Promise<string> {
    const code = rawCode.trim().toUpperCase();
    const rec = await this.consumeCode(code);
    if (rec.kind === "pod") throw new PairError("That's a pod invite — open Join pod instead.", "not_found");
    if (rec.created_by === this.deviceId) throw new PairError("That code belongs to this device.", "self");
    const map = readCodes();
    delete map[code]; // single use
    writeCodes(map);
    resetRateLimit();
    const partner = rec.created_by;
    setPartner(this.deviceId, partner);
    setPartner(partner, this.deviceId);
    this.broadcast("partners");
    this.emitPartners();
    return partner;
  }

  async unpair() {
    const partner = getPartner(this.deviceId);
    if (partner) setPartner(partner, null);
    setPartner(this.deviceId, null);
    this.broadcast("partners");
    this.emitPartners();
  }

  /* --------------------------- pods --------------------------- */

  private myPods(): Pod[] {
    return readMyPods(this.deviceId)
      .map((id) => readPods()[id])
      .filter((p): p is Pod => !!p && p.members.some((m) => m.device_id === this.deviceId));
  }

  private emitPods() {
    const pods = this.myPods();
    this.podSubs.forEach((cb) => cb(pods));
  }

  subscribePods(cb: (pods: Pod[]) => void) {
    this.podSubs.add(cb);
    this.emitPods();
    return () => this.podSubs.delete(cb);
  }

  async setDisplayName(name: string) {
    await setLockedUsername(name);
    localStorage.setItem(nameKey(this.deviceId), name);
    const pods = readPods();
    let changed = false;
    for (const pod of Object.values(pods)) {
      const member = pod.members.find((m) => m.device_id === this.deviceId);
      if (member && member.name !== name) {
        member.name = name;
        changed = true;
      }
    }
    if (changed) writePods(pods);
    this.broadcast("partners");
    this.emitPods();
  }

  async createPod(name: string, memberName: string): Promise<{ pod: Pod; code: PairCode }> {
    const memberNameOrDisplay = memberName || displayName(this.deviceId) || `Member 1`;
    const me: PodMember = {
      device_id: this.deviceId,
      uid: null,
      name: memberNameOrDisplay,
      joined_at: Date.now(),
    };
    const pod: Pod = {
      pod_id: makeId("pod"),
      name: name.trim() || "Shared Pod",
      created_by: this.deviceId,
      members: [me],
      max_members: POD_MAX_MEMBERS,
      created_at: Date.now(),
    };
    const pods = readPods();
    pods[pod.pod_id] = pod;
    writePods(pods);
    writeMyPods(this.deviceId, Array.from(new Set([...readMyPods(this.deviceId), pod.pod_id])));
    const code = await this.createInvite("pod", pod.pod_id);
    if (memberName) localStorage.setItem(nameKey(this.deviceId), memberName);
    this.broadcast("partners");
    this.emitPods();
    return { pod, code };
  }

  async joinPod(rawCode: string, memberName: string): Promise<Pod> {
    const code = rawCode.trim().toUpperCase();
    const rec = await this.consumeCode(code);
    if (rec.kind !== "pod" || !rec.pod_id) throw new PairError("That code is a 1:1 pair code, not a pod invite.", "not_found");
    const pods = readPods();
    const pod = pods[rec.pod_id];
    if (!pod) registerFailure();
    if (pod.members.some((m) => m.device_id === this.deviceId)) throw new PairError("You're already in this pod.", "self");
    if (pod.members.length >= pod.max_members) throw new PairError("This pod is full — 6 members is the limit.");
    const map = readCodes();
    delete map[code]; // single use
    writeCodes(map);
    resetRateLimit();
    if (memberName) localStorage.setItem(nameKey(this.deviceId), memberName);
    const memberNameOrDisplay = memberName || displayName(this.deviceId) || `Member ${pod.members.length + 1}`;
    pod.members = [
      ...pod.members,
      { device_id: this.deviceId, uid: null, name: memberNameOrDisplay, joined_at: Date.now() },
    ];
    pods[pod.pod_id] = pod;
    writePods(pods);
    writeMyPods(this.deviceId, Array.from(new Set([...readMyPods(this.deviceId), pod.pod_id])));
    this.broadcast("partners");
    this.emitPods();
    return pod;
  }

  async leavePod(podId: string) {
    const pods = readPods();
    const pod = pods[podId];
    if (!pod) return;
    pod.members = pod.members.filter((m) => m.device_id !== this.deviceId);
    if (pod.members.length === 0) delete pods[podId];
    else pods[podId] = pod;
    writePods(pods);
    writeMyPods(
      this.deviceId,
      readMyPods(this.deviceId).filter((id) => id !== podId)
    );
    this.broadcast("partners");
    this.emitPods();
  }

  /* ----------------------- entitlements ----------------------- */

  subscribeEntitlements(cb: (purchases: Purchase[]) => void) {
    this.entSubs.add(cb);
    cb(loadPurchases());
    return () => this.entSubs.delete(cb);
  }

  async savePurchases(list: Purchase[]) {
    savePurchases(list);
    this.entSubs.forEach((cb) => cb(list));
    this.broadcast("partners");
  }

  /* -------------------------- media --------------------------- */

  async uploadMedia(blob: Blob, kind: "image" | "voice"): Promise<string> {
    if (kind === "image") {
      return compressImageToDataUrl(blob);
    }
    return blobToDataUrl(blob);
  }

  async deleteMedia(_url: string) {
    /* Embedded in task document; clearing field removes it */
  }
}

/* ------------------------------------------------------------------ */
/* Firebase backend                                                     */
/* ------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadFirebase(cfg: FirebaseConfig) {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(/* @vite-ignore */ cdn("app")),
    import(/* @vite-ignore */ cdn("auth")),
    import(/* @vite-ignore */ cdn("firestore")),
  ]);
  const app = appMod.initializeApp(cfg);
  const auth = authMod.getAuth(app);
  if (!auth.currentUser) await authMod.signInAnonymously(auth);
  const db = fsMod.getFirestore(app);
  return { auth, db, fs: fsMod, authMod };
}

const toMillis = (v: unknown): number => {
  if (v && typeof v === "object" && "toMillis" in (v as Record<string, unknown>)) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return typeof v === "number" ? v : Date.now();
};

class FirebaseBackend implements Backend {
  mode: BackendMode = "firebase";
  uid: string | null = null;
  partnerUid: string | null = null;
  private unsubPartners: (() => void) | null = null;

  constructor(
    public deviceId: string,
    private db: any,
    private fs: any,
    uid: string
  ) {
    this.uid = uid;
  }

  static async create(deviceId: string, cfg: FirebaseConfig): Promise<FirebaseBackend> {
    const { db, fs, auth } = await loadFirebase(cfg);
    const uid: string = auth.currentUser?.uid ?? `anon:${deviceId}`;
    const userDocRef = fs.doc(db, "users", uid);
    let remoteUsername: string | null = null;
    try {
      const userSnap = await fs.getDoc(userDocRef);
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData?.username) {
          remoteUsername = uData.username;
          await setLockedUsername(remoteUsername);
        }
      }
      await fs.setDoc(
        userDocRef,
        {
          tier: "pro",
          purchases: DEFAULT_FREE_PURCHASES,
          device_id: deviceId,
          vervox_hardware_id: deviceId,
          ...(remoteUsername ? { username: remoteUsername, display_name: remoteUsername, username_locked: true } : {}),
          updated_at: fs.Timestamp.fromMillis(Date.now()),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("[vervox] user profile init warning", err);
    }
    return new FirebaseBackend(deviceId, db, fs, uid);
  }

  private taskRef(id: string) {
    return this.fs.doc(this.db, "tasks", id);
  }

  private strip(task: Task) {
    const member_uids = Array.from(new Set([this.uid, ...(task.member_uids ?? [])].filter(Boolean) as string[]));
    return {
      ...task,
      scope: task.scope || "personal",
      creator_id: task.creator_id || this.uid,
      creator_username: task.creator_username || displayName(this.deviceId) || "User",
      creator_hardware_id: task.creator_hardware_id || this.deviceId,
      member_uids,
      created_at: this.fs.Timestamp.fromMillis(task.created_at || Date.now()),
      updated_at: this.fs.Timestamp.fromMillis(task.updated_at || Date.now()),
      completed_at: task.completed_at ? this.fs.Timestamp.fromMillis(task.completed_at) : null,
    };
  }

  async refreshPartnerUid(): Promise<string | null> {
    if (!this.uid) return null;
    try {
      const snap = await this.fs.getDoc(this.fs.doc(this.db, "pairings", this.uid));
      const data = snap.data() as { partner_uid?: string | null } | undefined;
      this.partnerUid = data?.partner_uid ?? null;
      return this.partnerUid;
    } catch (err) {
      console.warn("[vervox] partner uid refresh failed", err);
      return this.partnerUid;
    }
  }

  subscribeTasks(cb: (tasks: Task[]) => void) {
    const snapshots = new Map<string, Task[]>();
    const emit = () => cb([...snapshots.values()].flat());
    const normalize = (snap: any): Task[] => snap.docs.map((d: any) => {
          const data = d.data() as Record<string, any>;
          return {
            ...data,
            scope: data.scope === "partner" || data.scope === "pod" ? data.scope : "personal",
            task_id: d.id,
            created_at: toMillis(data.created_at),
            updated_at: toMillis(data.updated_at),
            completed_at: data.completed_at ? toMillis(data.completed_at) : null,
            subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
            assigned_to: Array.isArray(data.assigned_to) ? data.assigned_to : [],
            member_uids: Array.isArray(data.member_uids) ? data.member_uids : [],
          } as Task;
        });
    const queries = [
      ["personal", this.fs.where("scope", "==", "personal"), this.fs.where("creator_id", "==", this.uid)],
      ["partner", this.fs.where("scope", "==", "partner"), this.fs.where("partner_uids", "array-contains", this.uid)],
      ["pod", this.fs.where("scope", "==", "pod"), this.fs.where("pod_member_uids", "array-contains", this.uid)],
    ] as const;
    const unsubs = queries.map(([key, ...constraints]) => {
      const q = this.fs.query(this.fs.collection(this.db, "tasks"), ...constraints);
      return this.fs.onSnapshot(q, (snap: any) => {
        const tasks = normalize(snap);
        snapshots.set(key, tasks);
        void cacheTasks([...snapshots.values()].flat());
        emit();
      }, (err: unknown) => console.warn(`[vervox] ${key} task listener error`, err));
    });
    return () => unsubs.forEach((unsubscribe: () => void) => unsubscribe());
  }

  subscribePartners(cb: (partners: string[]) => void) {
    const ref = this.fs.doc(this.db, "pairings", this.uid!);
    this.unsubPartners?.();
    this.unsubPartners = this.fs.onSnapshot(ref, (snap: any) => {
      const data = snap.data() as { partner_device?: string; partner_uid?: string | null } | undefined;
      this.partnerUid = data?.partner_uid ?? null;
      cb(data?.partner_device ? [data.partner_device] : []);
    });
    return () => {
      this.unsubPartners?.();
      this.unsubPartners = null;
    };
  }

  async upsertTask(task: Task) {
    task.member_uids = Array.from(new Set([this.uid!, ...(task.member_uids ?? [])].filter(Boolean)));
    await this.fs.setDoc(this.taskRef(task.task_id), this.strip(task));
  }

  async patchTask(id: string, patch: Partial<Task>) {
    const next: Record<string, unknown> = { ...patch, updated_at: this.fs.Timestamp.fromMillis(Date.now()) };
    if (patch.member_uids) next.member_uids = Array.from(new Set([this.uid!, ...patch.member_uids].filter(Boolean)));
    if (patch.completed_at !== undefined) {
      next.completed_at = patch.completed_at ? this.fs.Timestamp.fromMillis(patch.completed_at) : null;
    }
    await this.fs.updateDoc(this.taskRef(id), next);
  }

  async deleteTask(id: string) {
    await this.fs.deleteDoc(this.taskRef(id));
  }

  /* -------------------------- nudges -------------------------- */

  async sendNudge(nudge: { task_id: string; task_title: string; to: string[] }) {
    await this.fs.setDoc(this.fs.doc(this.fs.collection(this.db, "nudges")), {
      task_id: nudge.task_id,
      task_title: nudge.task_title,
      from_device: this.deviceId,
      from_name: (await this.fs.getDoc(this.fs.doc(this.db, "users", this.uid!))).data()?.display_name ?? "Your partner",
      to: nudge.to,
      created_at: this.fs.Timestamp.fromMillis(Date.now()),
    });
  }

  subscribeNudges(cb: (nudge: Nudge) => void) {
    // Only nudges created after this moment — history shouldn't re-fire.
    const q = this.fs.query(
      this.fs.collection(this.db, "nudges"),
      this.fs.where("to", "array-contains", this.deviceId),
      this.fs.where("created_at", ">", this.fs.Timestamp.fromMillis(Date.now()))
    );
    return this.fs.onSnapshot(
      q,
      (snap: any) => {
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const data = change.doc.data() as Record<string, unknown>;
          cb({ id: change.doc.id, ...data, created_at: toMillis(data.created_at) } as Nudge);
        }
      },
      (err: unknown) => console.warn("[vervox] nudge listener error", err)
    ) as () => void;
  }

  /* ------------------------- pairing ------------------------- */

  async createPairCode(): Promise<PairCode> {
    return this.createInvite("pair", null);
  }

  async createInvite(kind: "pair" | "pod", podId: string | null): Promise<PairCode> {
    const code = kind === "pod" ? makePodCode() : makePairCode();
    const expires_at = Date.now() + PAIR_TTL_MS;
    await this.fs.setDoc(this.fs.doc(this.db, "pair_codes", code), {
      code,
      created_by: this.deviceId,
      owner_uid: this.uid,
      kind,
      pod_id: podId,
      expires_at: this.fs.Timestamp.fromMillis(expires_at),
    });
    return { code, created_by: this.deviceId, expires_at, kind, pod_id: podId };
  }

  private async consumeCode(code: string) {
    const lock = getRateState();
    if (lock.lockedUntil > Date.now()) throw new PairError("Pairing temporarily locked. Try again shortly.", "rate_limited");
    const ref = this.fs.doc(this.db, "pair_codes", code);
    const snap = await this.fs.getDoc(ref);
    if (!snap.exists()) registerFailure();
    const data = snap.data() as {
      created_by: string;
      owner_uid?: string;
      kind?: "pair" | "pod";
      pod_id?: string | null;
      expires_at: unknown;
    };
    if (toMillis(data.expires_at) < Date.now()) {
      await this.fs.deleteDoc(ref);
      registerFailure();
    }
    return { ref, data };
  }

  async redeemPairCode(rawCode: string): Promise<string> {
    const code = rawCode.trim().toUpperCase();
    const { ref, data } = await this.consumeCode(code);
    if (data.kind === "pod") throw new PairError("That's a pod invite — open Join pod instead.", "not_found");
    if (data.created_by === this.deviceId) throw new PairError("That code belongs to this device.", "self");
    await this.fs.deleteDoc(ref);
    resetRateLimit();
    const partner = data.created_by;
    const now = this.fs.Timestamp.fromMillis(Date.now());
    await this.fs.setDoc(this.fs.doc(this.db, "pairings", this.uid!), {
      partner_device: partner,
      partner_uid: data.owner_uid ?? null,
      since: now,
    });
    this.partnerUid = data.owner_uid ?? null;
    if (data.owner_uid) {
      await this.fs.setDoc(this.fs.doc(this.db, "pairings", data.owner_uid), {
        partner_device: this.deviceId,
        partner_uid: this.uid,
        since: now,
      });
    }
    return partner;
  }

  async unpair() {
    const ref = this.fs.doc(this.db, "pairings", this.uid!);
    const snap = await this.fs.getDoc(ref);
    const data = snap.data() as { partner_uid?: string } | undefined;
    if (data?.partner_uid) await this.fs.deleteDoc(this.fs.doc(this.db, "pairings", data.partner_uid));
    await this.fs.deleteDoc(ref);
  }

  /* --------------------------- pods --------------------------- */

  subscribePods(cb: (pods: Pod[]) => void) {
    const q = this.fs.query(
      this.fs.collection(this.db, "pods"),
      this.fs.where("member_ids", "array-contains", this.deviceId)
    );
    return this.fs.onSnapshot(
      q,
      (snap: any) => cb(snap.docs.map((d: any) => ({ ...(d.data() as Pod), pod_id: d.id }))),
      (err: unknown) => console.warn("[vervox] pod listener error", err)
    ) as () => void;
  }

  async createPod(name: string, memberName: string): Promise<{ pod: Pod; code: PairCode }> {
    const pod_id = makeId("pod");
    const memberNameOrDisplay = memberName || displayName(this.deviceId) || `Member 1`;
    const member: PodMember = {
      device_id: this.deviceId,
      uid: this.uid,
      name: memberNameOrDisplay,
      joined_at: Date.now(),
    };
    const pod: Pod = {
      pod_id,
      name: name.trim() || "Shared Pod",
      created_by: this.deviceId,
      members: [member],
      max_members: POD_MAX_MEMBERS,
      created_at: Date.now(),
    };
    await this.fs.setDoc(this.fs.doc(this.db, "pods", pod_id), {
      ...pod,
      member_ids: [this.deviceId],
      member_uids: [this.uid].filter(Boolean) as string[],
      created_at: this.fs.Timestamp.fromMillis(pod.created_at),
    });
    if (memberName) await this.setDisplayName(memberName);
    const code = await this.createInvite("pod", pod_id);
    return { pod, code };
  }

  async joinPod(rawCode: string, memberName: string): Promise<Pod> {
    const code = rawCode.trim().toUpperCase();
    const { ref, data } = await this.consumeCode(code);
    if (data.kind !== "pod" || !data.pod_id) throw new PairError("That's a 1:1 pair code, not a pod invite.", "not_found");
    const podRef = this.fs.doc(this.db, "pods", data.pod_id);
    const podSnap = await this.fs.getDoc(podRef);
    if (!podSnap.exists()) registerFailure();
    const pod = podSnap.data() as Pod & { member_ids?: string[]; member_uids?: string[] };
    if ((pod.member_ids ?? []).length >= (pod.max_members ?? POD_MAX_MEMBERS))
      throw new PairError("This pod is full — 6 members is the limit.");
    if ((pod.member_ids ?? []).includes(this.deviceId)) throw new PairError("You're already in this pod.", "self");
    await this.fs.deleteDoc(ref);
    resetRateLimit();
    const memberNameOrDisplay = memberName || displayName(this.deviceId) || `Member ${(pod.members?.length ?? 0) + 1}`;
    const member: PodMember = {
      device_id: this.deviceId,
      uid: this.uid,
      name: memberNameOrDisplay,
      joined_at: Date.now(),
    };
    await this.fs.updateDoc(podRef, {
      members: this.fs.arrayUnion(member),
      member_ids: this.fs.arrayUnion(this.deviceId),
      member_uids: this.fs.arrayUnion(this.uid),
    });
    if (memberName) await this.setDisplayName(memberName);
    return { ...pod, pod_id: data.pod_id, members: [...(pod.members ?? []), member] };
  }

  async leavePod(podId: string) {
    const podRef = this.fs.doc(this.db, "pods", podId);
    const snap = await this.fs.getDoc(podRef);
    if (!snap.exists()) return;
    const pod = snap.data() as Pod & { member_ids?: string[]; member_uids?: string[] };
    const members = (pod.members ?? []).filter((m) => m.device_id !== this.deviceId);
    if (members.length === 0) {
      await this.fs.deleteDoc(podRef);
      return;
    }
    await this.fs.updateDoc(podRef, {
      members,
      member_ids: members.map((m) => m.device_id),
      member_uids: members.map((m) => m.uid).filter(Boolean) as string[],
    });
  }

  async setDisplayName(name: string) {
    await setLockedUsername(name);
    localStorage.setItem(nameKey(this.deviceId), name);
    await this.fs.setDoc(
      this.fs.doc(this.db, "users", this.uid!),
      {
        username: name,
        display_name: name,
        vervox_hardware_id: this.deviceId,
        username_locked: true,
        updated_at: this.fs.Timestamp.fromMillis(Date.now()),
      },
      { merge: true }
    );
  }

  /* ----------------------- entitlements ----------------------- */

  subscribeEntitlements(cb: (purchases: Purchase[]) => void) {
    const ref = this.fs.doc(this.db, "users", this.uid!);
    return this.fs.onSnapshot(
      ref,
      (snap: any) => {
        const data = snap.data() as { purchases?: Purchase[] } | undefined;
        cb(data?.purchases ?? []);
      },
      (err: unknown) => console.warn("[vervox] entitlement listener error", err)
    ) as () => void;
  }

  async savePurchases(list: Purchase[]) {
    await this.fs.setDoc(
      this.fs.doc(this.db, "users", this.uid!),
      {
        purchases: list,
        tier: computeEntitlements(list).tier,
        device_id: this.deviceId,
        updated_at: this.fs.Timestamp.fromMillis(Date.now()),
      },
      { merge: true }
    );
  }

  /* -------------------------- media --------------------------- */

  async uploadMedia(blob: Blob, kind: "image" | "voice"): Promise<string> {
    if (kind === "image") {
      return compressImageToDataUrl(blob);
    }
    return blobToDataUrl(blob);
  }

  async deleteMedia(_url: string) {
    /* Base64 data URLs are embedded directly in Firestore documents; clearing the field removes it */
  }
}

/* ------------------------------------------------------------------ */
/* Factory                                                              */
/* ------------------------------------------------------------------ */

export async function createBackend(deviceId: string): Promise<Backend> {
  const cfg = activeConfig();
  if (cfg) {
    try {
      return await FirebaseBackend.create(deviceId, cfg);
    } catch (err) {
      console.warn("[vervox] Firebase unavailable, falling back to local engine", err);
    }
  }
  return new LocalBackend(deviceId);
}

export const PAIR_TTL = PAIR_TTL_MS;
export const MAX_PAIR_ATTEMPTS = MAX_ATTEMPTS;
