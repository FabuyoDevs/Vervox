import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activeConfig,
  createBackend,
  displayName,
  getRateState,
  PairError,
  rateLockRemaining,
  resetRateLimit,
  resolveDeviceId,
  secondDeviceUrl,
  type Backend,
} from "@/lib/backend";
import { computeEntitlements, loadPurchases, recordPurchase, type CheckoutResult } from "@/lib/billing";
import { DEFAULT_CURRENCY, detectCurrency, storedCurrency, type Currency } from "@/lib/geo";
import { idbDelete, idbGetAll, idbPut, STORE_ARCHIVE, STORE_TASKS } from "@/lib/idb";
import { enqueue, flushQueue, queueSize, type SyncTarget } from "@/lib/syncQueue";
import { fireLocalNotification, notificationsEnabled } from "@/lib/pwa";
import { playAlarm, playCompleteChime, playDeleteChime, playNudge, playPairChime, playUndoChime, setChimePack } from "@/lib/audio";
import { applyTheme, CHIME_PACKS, setChime, storedChime, storedTheme, THEMES } from "@/lib/themes";
import type { AppView, Entitlements, Nudge, Pod, Priority, Purchase, SkuId, Task, TaskScope, ViewType } from "@/lib/types";
import { deviceUuid, inQuietHours, loadQuietHours, nowTime, progressOf, sortByDateTime, sortTasks, todayKey, uid as makeId } from "@/lib/utils";
import { resolveSecureVault } from "@/lib/vault";

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "danger";
  action?: { label: string; run: () => void };
}

export interface NewTaskInput {
  title: string;
  view_type?: ViewType;
  /** Set by the Scheduled view: forces `view_type` regardless of the chosen date. */
  forceView?: ViewType;
  schedule: { has_alarm: boolean; date: string; time: string } | null;
  location: { lat: number; lng: number; label?: string } | null;
  priority: Priority;
  scope?: TaskScope;
  partner_pair_id?: string | null;
  partner_uids?: string[];
  pod_id?: string | null;
  pod_member_uids?: string[];
  tagged_members?: string[];
}

export interface ShareTarget {
  device_id: string;
  uid: string | null;
  name: string;
}

const pairId = (left: string, right: string) => [left, right].sort().join(":");

const EMPTY_MEDIA: Task["media"] = {
  proof_image_url: null,
  voice_note_url: null,
  voice_duration_ms: null,
  captured_by: null,
  captured_at: null,
};

export function useVervox(initialView: AppView = "all") {
  const backendRef = useRef<Backend | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Backend["mode"]>("local");
  const [uid, setUid] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [archived, setArchived] = useState<Task[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pairLock, setPairLock] = useState(0);
  const [themeId, setThemeId] = useState(storedTheme());
  const [chimeId, setChimeId] = useState(storedChime());
  const [name, setName] = useState("");
  const [usernameLocked, setUsernameLocked] = useState(false);
  const [currency, setCurrency] = useState<Currency>(storedCurrency() ?? DEFAULT_CURRENCY);
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState<number>(0);
  const firedAlarms = useRef<Set<string>>(new Set());
  const sharedWith = useRef<Set<string>>(new Set());
  const lastDay = useRef<string>(todayKey());
  const tasksRef = useRef<Task[]>([]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  /* Currency is resolved once per session (cached 24h) from IP metadata and
     mirrored onto window.userDetectedCurrency for the payment trigger. */
  useEffect(() => {
    window.userDetectedCurrency = storedCurrency() ?? DEFAULT_CURRENCY;
    void detectCurrency().then((res) => {
      window.userDetectedCurrency = res.currency;
      setCurrency(res.currency);
    });
  }, []);

  /* ---------------- toasts ---------------- */
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const shouldShowToast = useCallback((message: string) => {
    return /^(Created|Deleted)\s—\s/.test(message)
      || /^Partner linked\b/.test(message)
      || /^Partner unlinked\b/.test(message)
      || /^Pod\s/.test(message)
      || /^Joined\s/.test(message)
      || /^Left\s/.test(message);
  }, []);

  const pushToast = useCallback(
    (message: string, tone: Toast["tone"] = "info", action?: Toast["action"], ttl = 8000) => {
      if (!shouldShowToast(message)) return;
      const id = makeId("toast");
      setToasts((t) => [...t.slice(-2), { id, message, tone, action }]);
      window.setTimeout(() => dismissToast(id), action ? 12000 : ttl);
    },
    [dismissToast, shouldShowToast]
  );

  /* ---------------- boot ---------------- */
  useEffect(() => {
    let alive = true;
    const cleanups: Array<(() => void) | null> = [];
    (async () => {
      const id = await resolveDeviceId();
      const backend = await createBackend(id);
      if (!alive) return;
      backendRef.current = backend;
      setDeviceId(id);
      setMode(backend.mode);
      setUid(backend.uid);
      const vault = await resolveSecureVault();
      setUsernameLocked(vault.username_locked);
      setName(vault.username || displayName(id));
      setPurchases(loadPurchases());
      setReady(true);
      try {
        const cached = await idbGetAll<Task>(STORE_TASKS);
        if (cached.length) setTasks(sortTasks(cached.filter((t) => t.assigned_to?.includes(id))));
      } catch {
        /* ignore */
      }
      cleanups.push(backend.subscribeTasks((next) => setTasks(sortTasks(next))));
      cleanups.push(backend.subscribePartners((next) => setPartners(next)));
      cleanups.push(backend.subscribePods((next) => setPods(next)));
      cleanups.push(backend.subscribeEntitlements((next) => setPurchases(next)));
      cleanups.push(backend.subscribeNudges((nudge) => nudgeHandler.current(nudge)));

      /* First-run onboarding + welcome task. */
      try {
        const seeded = localStorage.getItem("vervox:seeded") === "1";
        if (!seeded) {
          const welcome: Task = {
            task_id: makeId("task"),
            title: "Tap ✓ to complete your first task!",
            scope: "personal",
            creator_id: backend.uid || id,
            creator_username: vault.username || displayName(id) || "You",
            creator_hardware_id: id,
            created_by: id,
            created_by_name: vault.username || displayName(id) || null,
            assigned_to: [id],
            tagged_members: [],
            member_uids: [backend.uid].filter(Boolean) as string[],
            pod_id: null,
            is_completed: false,
            completed_by: null,
            completed_at: null,
            view_type: "today",
            schedule: null,
            optional_location: null,
            subtasks: [],
            media: { ...EMPTY_MEDIA },
            priority: "normal",
            created_at: Date.now(),
            updated_at: Date.now(),
            order: Date.now(),
          };
          await backend.upsertTask(welcome).catch(() => undefined);
          localStorage.setItem("vervox:seeded", "1");
        }
      } catch {
        /* private-mode / storage denied — safe to skip */
      }
      try {
        setArchived(await idbGetAll<Task>(STORE_ARCHIVE));
      } catch {
        /* ignore */
      }
      setPairLock(rateLockRemaining());
    })();
    return () => {
      alive = false;
      cleanups.forEach((c) => c?.());
    };
  }, []);

  /* ---------------- derived ---------------- */
  const today = todayKey();
  const todayTasks = useMemo(() => tasks.filter((t) => t.view_type === "today"), [tasks]);
  const scheduledTasks = useMemo(
    () => sortTasks(tasks.filter((t) => t.view_type === "scheduled" && !t.is_completed)),
    [tasks]
  );
  /** Homepage: one combined list — today's focus first, then the dated queue. */
  const allTasks = useMemo(
    () => [
      ...sortTasks(tasks.filter((t) => t.view_type === "today")),
      ...sortByDateTime(tasks.filter((t) => t.view_type === "scheduled")),
    ],
    [tasks]
  );
  const progress = useMemo(() => progressOf(todayTasks), [todayTasks]);

  const scheduledGroups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of scheduledTasks) {
      const key = t.schedule?.date ?? "unscheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [scheduledTasks]);

  const entitlements: Entitlements = useMemo(() => computeEntitlements(purchases), [purchases]);

  const shareTargets = useMemo<ShareTarget[]>(() => {
    const map = new Map<string, ShareTarget>();
    for (const id of partners) if (id !== deviceId) map.set(id, { device_id: id, uid: null, name: "Partner" });
    for (const pod of pods) {
      for (const m of pod.members) {
        if (m.device_id === deviceId) continue;
        map.set(m.device_id, { device_id: m.device_id, uid: m.uid ?? null, name: m.name || "Member" });
      }
    }
    return [...map.values()];
  }, [partners, pods, deviceId]);

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of shareTargets) map.set(t.device_id, t.name);
    if (name) map.set(deviceId, name);
    return map;
  }, [shareTargets, deviceId, name]);

  /* ---------------- theme + chimes ---------------- */
  useEffect(() => {
    applyTheme(themeId, entitlements.themes);
    setChimePack(setChime(chimeId, entitlements.themes));
  }, [themeId, chimeId, entitlements.themes]);

  /* ---------------- mutations ---------------- */
  const memberUids = useCallback(() => {
    const b = backendRef.current;
    if (!b) return [];
    return Array.from(new Set([b.uid, b.partnerUid, ...shareTargets.map((t) => t.uid)].filter(Boolean) as string[]));
  }, [shareTargets]);

  /* Any write goes through this shim so it queues to IndexedDB when offline
     (or when Firestore rejects the write) and drains automatically later. */
  const asTarget = useCallback((): SyncTarget | null => {
    const b = backendRef.current;
    if (!b) return null;
    return {
      upsertTask: (task) => b.upsertTask(task),
      patchTask: (id, p) => b.patchTask(id, p),
      deleteTask: (id) => b.deleteTask(id),
    };
  }, []);

  const runOrQueue = useCallback(
    async (perform: (t: SyncTarget) => Promise<void>, fallback: () => Promise<void>, optimistic?: () => void) => {
      const target = asTarget();
      if (!target || !navigator.onLine) {
        await fallback();
        optimistic?.();
        setPending(await queueSize());
        return;
      }
      try {
        await perform(target);
      } catch (err) {
        console.warn("[vervox] write failed, queuing", err);
        await fallback();
        optimistic?.();
        setPending(await queueSize());
        pushToast("Saved locally. Cloud sync will retry when Firebase is reachable.", "info", undefined, 9000);
      }
    },
    [asTarget, pushToast]
  );

  const addTask = useCallback(
    async (input: NewTaskInput) => {
      const b = backendRef.current;
      if (!b || !input.title.trim()) return;
      await b.refreshPartnerUid();
      const scope = input.scope ?? "personal";
      const selectedPod = input.pod_id ? pods.find((pod) => pod.pod_id === input.pod_id) : undefined;
      const selectedPartnerUid = b.partnerUid;
      const selectedPartnerDevice = partners.find((id) => id !== b.deviceId);
      const assigned = scope === "personal"
        ? [b.deviceId]
        : scope === "partner"
          ? Array.from(new Set([b.deviceId, selectedPartnerDevice].filter(Boolean) as string[]))
          : Array.from(new Set([b.deviceId, ...(selectedPod?.members.map((member) => member.device_id) ?? [])])).slice(0, 6);
      const selectedPartnerUids = scope === "partner"
        ? Array.from(new Set([b.uid, selectedPartnerUid].filter(Boolean) as string[]))
        : [];
      const selectedPodUids = scope === "pod"
        ? Array.from(new Set(selectedPod?.members.map((member) => member.uid).filter(Boolean) as string[] ?? []))
        : [];
      const derived: ViewType = input.schedule && input.schedule.date > todayKey() ? "scheduled" : "today";
      const task: Task = {
        task_id: makeId("task"),
        title: input.title.trim(),
        scope,
        creator_id: b.uid || b.deviceId,
        creator_username: name || "User",
        creator_hardware_id: b.deviceId,
        created_by: b.deviceId,
        created_by_name: name || null,
        assigned_to: assigned,
        tagged_members: input.tagged_members ?? [],
        member_uids: scope === "personal" ? (b.uid ? [b.uid] : []) : scope === "partner" ? selectedPartnerUids : selectedPodUids,
        partner_pair_id: scope === "partner" && selectedPartnerDevice ? pairId(b.deviceId, selectedPartnerDevice) : null,
        partner_uids: selectedPartnerUids,
        pod_id: scope === "pod" ? input.pod_id ?? null : null,
        pod_member_uids: selectedPodUids,
        is_completed: false,
        completed_by: null,
        completed_by_name: null,
        completed_at: null,
        view_type: input.forceView ?? (input.schedule ? derived : (input.view_type ?? "today")),
        schedule: input.schedule,
        optional_location: input.location,
        subtasks: [],
        media: { ...EMPTY_MEDIA },
        priority: input.priority,
        created_at: Date.now(),
        updated_at: Date.now(),
        order: Date.now(),
      };
      await runOrQueue(
        (t) => t.upsertTask(task),
        async () => {
          await idbPut(STORE_TASKS, task);
          await enqueue({ kind: "upsert", task });
        },
        () => setTasks((prev) => sortTasks([...prev.filter((t) => t.task_id !== task.task_id), task]))
      );
      pushToast(`Created — ${task.title}`, "success");
      return task;
    },
    [name, partners, pods, pushToast, runOrQueue]
  );

  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      await runOrQueue(
        (t) => t.patchTask(id, patch),
        async () => {
          const current = tasksRef.current.find((t) => t.task_id === id);
          if (current) await idbPut(STORE_TASKS, { ...current, ...patch, updated_at: Date.now() });
          await enqueue({ kind: "patch", id, patch });
        },
        () => setTasks((prev) => sortTasks(prev.map((t) => (t.task_id === id ? { ...t, ...patch, updated_at: Date.now() } : t))))
      );
    },
    [runOrQueue]
  );

  const toggleComplete = useCallback(
    async (task: Task) => {
      const b = backendRef.current;
      if (!b) return;
      const next = !task.is_completed;
      const patch: Partial<Task> = {
        is_completed: next,
        completed_by: next ? b.deviceId : null,
        completed_by_name: next ? (name || "Partner") : null,
        completed_at: next ? Date.now() : null,
      };
      await runOrQueue(
        (t) => t.patchTask(task.task_id, patch),
        () => enqueue({ kind: "patch", id: task.task_id, patch }).then(() => undefined)
      );
      if (next) {
        playCompleteChime();
        pushToast(`Completed — ${task.title}`, "success", {
          label: "Undo",
          run: () => {
            playUndoChime();
            void b.patchTask(task.task_id, { is_completed: false, completed_by: null, completed_at: null });
          },
        });
      }
    },
    [pushToast]
  );

  const removeTask = useCallback(
    async (task: Task) => {
      const b = backendRef.current;
      if (!b) return;
      await runOrQueue(
        (t) => t.deleteTask(task.task_id),
        async () => {
          await idbDelete(STORE_TASKS, task.task_id);
          await enqueue({ kind: "delete", id: task.task_id });
        },
        () => setTasks((prev) => prev.filter((t) => t.task_id !== task.task_id))
      );
      playDeleteChime();
      pushToast(`Deleted — ${task.title}`, "danger", {
        label: "Undo",
        run: () => {
          playUndoChime();
          void b.upsertTask(task);
        },
      });
    },
    [pushToast]
  );

  const moveTask = useCallback(async (task: Task, view: ViewType) => {
    const b = backendRef.current;
    if (!b || task.view_type === view) return;
    const schedule =
      view === "today"
        ? task.schedule
          ? { ...task.schedule, date: todayKey() }
          : null
        : task.schedule ?? { has_alarm: false, date: todayKey(), time: nowTime() };
    await b.patchTask(task.task_id, { view_type: view, schedule });
  }, []);

  const addSubtask = useCallback(
    async (task: Task, title: string) => {
      if (!title.trim()) return;
      await patchTask(task.task_id, {
        subtasks: [...task.subtasks, { id: makeId("sub"), title: title.trim(), done: false }],
      });
    },
    [patchTask]
  );

  const toggleSubtask = useCallback(
    async (task: Task, subId: string) => {
      await patchTask(task.task_id, {
        subtasks: task.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)),
      });
    },
    [patchTask]
  );

  const removeSubtask = useCallback(
    async (task: Task, subId: string) => {
      await patchTask(task.task_id, { subtasks: task.subtasks.filter((s) => s.id !== subId) });
    },
    [patchTask]
  );

  const restoreTask = useCallback(async (task: Task) => {
    await backendRef.current?.upsertTask(task);
  }, []);

  const archiveTask = useCallback(async (task: Task) => {
    const b = backendRef.current;
    if (!b) return;
    await idbPut(STORE_ARCHIVE, { ...task, is_completed: true });
    setArchived((prev) => [{ ...task, is_completed: true }, ...prev.filter((t) => t.task_id !== task.task_id)]);
    await b.deleteTask(task.task_id);
  }, []);

  /* ---------------- media attachments ---------------- */
  const attachMedia = useCallback(
    async (
      task: Task,
      patch: { image?: File | Blob | null; voice?: Blob | null; durationMs?: number | null }
    ) => {
      const b = backendRef.current;
      if (!b || !entitlements.cloudMedia) return;
      const media = { ...EMPTY_MEDIA, ...task.media };
      if (patch.image) {
        if (media.proof_image_url) await b.deleteMedia(media.proof_image_url).catch(() => undefined);
        media.proof_image_url = await b.uploadMedia(patch.image, "image");
      }
      if (patch.voice) {
        if (media.voice_note_url) await b.deleteMedia(media.voice_note_url).catch(() => undefined);
        media.voice_note_url = await b.uploadMedia(patch.voice, "voice");
        media.voice_duration_ms = patch.durationMs ?? null;
      }
      media.captured_by = b.deviceId;
      media.captured_at = Date.now();
      await b.patchTask(task.task_id, { media });
      return media;
    },
    [entitlements.cloudMedia]
  );

  const clearMedia = useCallback(async (task: Task, kind: "image" | "voice") => {
    const b = backendRef.current;
    if (!b) return;
    const media = { ...EMPTY_MEDIA, ...task.media };
    const url = kind === "image" ? media.proof_image_url : media.voice_note_url;
    if (url) await b.deleteMedia(url).catch(() => undefined);
    if (kind === "image") media.proof_image_url = null;
    else {
      media.voice_note_url = null;
      media.voice_duration_ms = null;
    }
    await b.patchTask(task.task_id, { media });
  }, []);

  /* ---------------- nudges + partner updates ---------------- */
  const nudgeHandler = useRef<(nudge: Nudge) => void>(() => undefined);

  useEffect(() => {
    nudgeHandler.current = (nudge: Nudge) => {
      if (!inQuietHours(loadQuietHours())) playNudge();
      if (notificationsEnabled())
        void fireLocalNotification(
          `${nudge.from_name} nudged you`,
        nudge.task_title ? `Reminder: ${nudge.task_title}` : "Open Vervox to check your tasks",
        `nudge-${nudge.id}`
      );
      pushToast(`🔔 ${nudge.from_name} nudged: ${nudge.task_title}`, "info", undefined, 6000);
    };
  }, [pushToast]);

  const sendNudge = useCallback(
    async (task: Task) => {
      const b = backendRef.current;
      if (!b) return;
      if (!shareTargets.length) {
        pushToast("Link a partner or pod to send nudges.", "info");
        return;
      }
      await b.sendNudge({ task_id: task.task_id, task_title: task.title, to: shareTargets.map((t) => t.device_id) });
      pushToast(`Nudge sent to ${shareTargets.length} member${shareTargets.length === 1 ? "" : "s"}.`, "success");
    },
    [pushToast, shareTargets]
  );

  /* ---------------- pairing + pods ---------------- */
  const generateCode = useCallback(async () => {
    const b = backendRef.current;
    if (!b) throw new Error("Not ready");
    if (rateLockRemaining() > 0) throw new PairError("Pairing locked.", "rate_limited");
    return b.createPairCode();
  }, []);

  const joinCode = useCallback(
    async (raw: string) => {
      const b = backendRef.current;
      if (!b) throw new Error("Not ready");
      try {
        const partner = await b.redeemPairCode(raw);
        playPairChime();
        pushToast("Partner linked — tasks now sync in real time.", "success");
        setPairLock(0);
        return partner;
      } catch (err) {
        if (err instanceof PairError) setPairLock(Math.max(rateLockRemaining(), err.reason === "rate_limited" ? 1000 : 0));
        throw err;
      }
    },
    [pushToast]
  );

  const unpair = useCallback(async () => {
    const b = backendRef.current;
    if (!b) return;
    await b.unpair();
    sharedWith.current.clear();
    setPartners([]);
    pushToast("Partner unlinked.", "info");
  }, [pushToast]);

  const createPod = useCallback(
    async (podName: string, memberName: string) => {
      const b = backendRef.current;
      if (!b) throw new Error("Not ready");
      const result = await b.createPod(podName, memberName);
      playPairChime();
      setName(memberName);
      pushToast(`Pod “${result.pod.name}” created — share the invite code.`, "success");
      return result;
    },
    [pushToast]
  );

  const inviteToPod = useCallback(async (podId: string) => {
    const b = backendRef.current;
    if (!b) throw new Error("Not ready");
    return b.createInvite("pod", podId);
  }, []);

  const joinPod = useCallback(
    async (code: string, memberName: string) => {
      const b = backendRef.current;
      if (!b) throw new Error("Not ready");
      try {
        const pod = await b.joinPod(code, memberName);
        playPairChime();
        setName(memberName);
        pushToast(`Joined “${pod.name}” — ${pod.members.length}/${pod.max_members} members.`, "success");
        setPairLock(0);
        return pod;
      } catch (err) {
        if (err instanceof PairError) setPairLock(Math.max(rateLockRemaining(), err.reason === "rate_limited" ? 1000 : 0));
        throw err;
      }
    },
    [pushToast]
  );

  const leavePod = useCallback(
    async (podId: string) => {
      await backendRef.current?.leavePod(podId);
      pushToast("Left the pod.", "info");
    },
    [pushToast]
  );

  const updateName = useCallback(async (value: string) => {
    setName(value);
    await backendRef.current?.setDisplayName(value);
  }, []);

  const openSecondDevice = useCallback(() => {
    window.open(secondDeviceUrl(), "_blank", "noopener");
  }, []);

  /* ---------------- monetisation (Flutterwave · NGN) ---------------- */
  const syncPurchases = useCallback(async (list: Purchase[]) => {
    setPurchases(list);
    await backendRef.current?.savePurchases(list);
  }, []);

  /** Grants a purchase and mirrors the new tier to Firestore `users/{uid}`. */
  const updateUserTier = useCallback(
    async (sku: SkuId, mode: "live" | "demo" = "live") => {
      recordPurchase(sku, mode);
      await syncPurchases(loadPurchases());
    },
    [syncPurchases]
  );

  const buy = useCallback(
    async (sku: SkuId): Promise<CheckoutResult> => {
      const purchase = recordPurchase(sku, "demo");
      await syncPurchases(loadPurchases());
      pushToast("All features are free and unlocked.", "success");
      return { ok: true, mode: "demo", message: "All features unlocked.", purchase };
    },
    [pushToast, syncPurchases]
  );

  const restorePurchases = useCallback(async () => {
    await syncPurchases(loadPurchases());
    pushToast("Purchases restored on this device.", "success");
  }, [pushToast, syncPurchases]);

  /* ---------------- share existing tasks with new members ---------------- */
  useEffect(() => {
    const b = backendRef.current;
    if (!b || !shareTargets.length) return;
    const fresh = shareTargets.filter((t) => !sharedWith.current.has(t.device_id));
    if (!fresh.length) return;
    fresh.forEach((t) => sharedWith.current.add(t.device_id));
    const uids = memberUids();
    for (const t of tasks) {
      if (fresh.every((f) => t.assigned_to.includes(f.device_id)) && uids.every((u) => t.member_uids.includes(u))) continue;
      void b.patchTask(t.task_id, {
        assigned_to: Array.from(new Set([...t.assigned_to, ...fresh.map((f) => f.device_id)])).slice(0, 6),
        member_uids: Array.from(new Set([...t.member_uids, ...uids])),
      });
    }
  }, [shareTargets, tasks, memberUids]);

  /* Partner / pod completions → lock-screen notification */
  const lastCompletion = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    for (const t of tasks) {
      const prev = lastCompletion.current.get(t.task_id);
      lastCompletion.current.set(t.task_id, t.is_completed);
      if (prev !== false) continue; // only react to a false → true transition
      if (!t.is_completed || !t.completed_by || t.completed_by === deviceId) continue;
      const who = memberNames.get(t.completed_by) ?? "Your partner";
      if (notificationsEnabled())
        void fireLocalNotification(`${who} completed a task`, t.title, `done-${t.task_id}-${t.completed_at ?? ""}`);
      pushToast(`✅ ${who} completed: ${t.title}`, "success", undefined, 6000);
    }
  }, [tasks, deviceId, memberNames, pushToast]);

  /* ---------------- offline sync ---------------- */
  useEffect(() => {
    const drain = async () => {
      const target = asTarget();
      if (!target || !navigator.onLine) return;
      const { synced, remaining } = await flushQueue(target);
      setPending(remaining);
      if (synced > 0) pushToast(`Synced ${synced} offline change${synced === 1 ? "" : "s"}.`, "success");
    };
    const onOnline = () => {
      setOnline(true);
      void drain();
    };
    const onOffline = () => setOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void drain();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    void queueSize().then(setPending);
    void drain();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [asTarget, pushToast, ready]);

  /* ---------------- midnight rollover + alarms ---------------- */
  useEffect(() => {
    const b = backendRef.current;
    if (!b) return;
    const tick = () => {
      const nowKey = todayKey();
      if (nowKey !== lastDay.current) {
        lastDay.current = nowKey;
        setTasks((current) => {
          for (const t of current) {
            if (t.view_type === "scheduled" && t.schedule && t.schedule.date <= nowKey && !t.is_completed) {
              void b.patchTask(t.task_id, { view_type: "today", schedule: { ...t.schedule, date: nowKey } });
            }
            if (t.is_completed) void archiveTask(t);
          }
          return current;
        });
      }
      const hhmm = nowTime();
      for (const t of tasksRef.current) {
        if (!t.schedule?.has_alarm || t.is_completed) continue;
        if (t.schedule.date !== nowKey || !t.schedule.time) continue;
        const key = `${t.task_id}|${t.schedule.date}|${t.schedule.time}`;
        if (firedAlarms.current.has(key)) continue;
        if (t.schedule.time <= hhmm) {
          firedAlarms.current.add(key);
          const quiet = inQuietHours(loadQuietHours());
          if (!quiet) playAlarm();
          if (notificationsEnabled()) void fireLocalNotification("Vervox alarm", t.title, `alarm-${t.task_id}`);
          pushToast(`⏰ ${t.title}`, "info", { label: "Done", run: () => void toggleComplete(t) });
        }
      }
    };
    tick();
    const i = window.setInterval(tick, 15000);
    return () => window.clearInterval(i);
  }, [ready, archiveTask, pushToast, toggleComplete]);

  return {
    ready,
    mode,
    deviceId,
    uid,
    name,
    tasks,
    allTasks,
    todayTasks: sortTasks(todayTasks),
    scheduledTasks,
    scheduledGroups,
    progress,
    partners,
    pods,
    online,
    pending,
    shareTargets,
    memberNames,
    entitlements,
    purchases,
    currency,
    archived,
    toasts,
    pairLock,
    pairAttempts: getRateState().attempts,
    firebaseConfigured: !!activeConfig(),
    today,
    themeId,
    chimeId,
    usernameLocked,
    partnerName: partners[0] ? (displayName(partners[0]) || "Partner") : null,
    themes: THEMES,
    chimes: CHIME_PACKS,
    view: initialView,
    dismissToast,
    pushToast,
    addTask,
    patchTask,
    toggleComplete,
    removeTask,
    moveTask,
    addSubtask,
    toggleSubtask,
    removeSubtask,
    restoreTask,
    archiveTask,
    attachMedia,
    clearMedia,
    sendNudge,
    generateCode,
    joinCode,
    createPod,
    joinPod,
    inviteToPod,
    leavePod,
    unpair,
    updateName,
    openSecondDevice,
    buy,
    updateUserTier,
    restorePurchases,
    setThemeId,
    setChimeId,
    resetRateLimit: () => {
      resetRateLimit();
      setPairLock(0);
    },
    newDeviceId: deviceUuid,
  };
}
