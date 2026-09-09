import { useEffect, useState } from "react";
import NavDrawer, { type NavItem } from "@/components/NavDrawer";
import Onboarding from "@/components/Onboarding";
import PairingModal from "@/components/PairingModal";
import SettingsSheet from "@/components/SettingsSheet";
import TaskComposer from "@/components/TaskComposer";
import TaskItem from "@/components/TaskItem";
import Toasts from "@/components/Toasts";
import MediaCapture from "@/components/MediaCapture";
import PodSheet from "@/components/PodSheet";
import Prompts from "@/components/Prompts";
import NativePermissionPrompt from "@/components/NativePermissionPrompt";
import {
  IconArchive,
  IconCalendar,
  IconCloud,
  IconInbox,
  IconLink,
  IconMenu,
  IconSettings,
  IconSun,
  IconUsers,
} from "@/components/Icons";
import { useVervox } from "@/hooks/useVervox";
import { unlockAudio } from "@/lib/audio";
import { prettyDate, prettyGroup, sortByDateTime, sortTasks, todayKey } from "@/lib/utils";
import type { AppView, Task, ViewType } from "@/lib/types";
import UsernameModal from "@/components/UsernameModal";
import { setLockedUsername } from "@/lib/vault";
import { requestNotificationPermission } from "@/lib/pwa";

const VALID: AppView[] = ["all", "today", "scheduled", "partner", "pods"];
const pairId = (left: string, right: string) => [left, right].sort().join(":");
const readView = (): AppView => {
  const v = new URLSearchParams(location.search).get("view") as AppView | null;
  return v && VALID.includes(v) ? v : "all";
};

const META: Record<AppView, { title: string; subtitle: string; emptyTitle: string; emptyBody: string }> = {
  all: {
    title: "All Tasks",
    subtitle: "Today's focus and everything queued ahead",
    emptyTitle: "Nothing on your plate",
    emptyBody: "Add a task below — leave it unscheduled for today, or tick “Schedule this task” to queue it.",
  },
  today: {
    title: "Today's Tasks",
    subtitle: "Everything assigned to the current day",
    emptyTitle: "Today is clear",
    emptyBody: "Add a task below — it's saved straight to today, no date picking required.",
  },
  scheduled: {
    title: "Scheduled Tasks",
    subtitle: "Queued for a specific future date and time",
    emptyTitle: "Nothing queued",
    emptyBody: "Schedule a task with a date and time and it lands in this timeline.",
  },
  partner: {
    title: "Partner Accountability",
    subtitle: "1-on-1 split focus with your partner",
    emptyTitle: "No Partner Tasks",
    emptyBody: "Link a partner to share tasks and send real-time reminders.",
  },
  pods: {
    title: "Group Pods",
    subtitle: "Collaborative workspaces for 3–6 teammates",
    emptyTitle: "No Pod Tasks",
    emptyBody: "Create or join a Pod to tag teammates and track group commitments.",
  },
};

export default function App() {
  const v = useVervox();
  const [view, setView] = useState<AppView>(readView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [mediaTask, setMediaTask] = useState<Task | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem("vervox:onboarded") !== "1");
  const [showUsername, setShowUsername] = useState(false);
  const [iosInstallDismissed, setIosInstallDismissed] = useState(() => localStorage.getItem("vervox:ios-install-dismissed") === "1");
  const [permissionKind, setPermissionKind] = useState<"notifications" | "media" | null>(null);

  /** The first pod (or the one matching the current view) — drives the TaskComposer tag UI. */
  const activePod = view === "pods" && v.pods.length > 0 ? v.pods[0] : null;

  const requestProof = (task: Task) => {
    setMediaTask(task);
  };

  /* Show the one-time username modal when the vault has no locked username. */
  useEffect(() => {
    if (v.ready && !v.usernameLocked) setShowUsername(true);
  }, [v.ready, v.usernameLocked]);

  const handleClaimUsername = async (username: string) => {
    await setLockedUsername(username);
    await v.updateName(username);
    setShowUsername(false);
  };

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("click", unlock, { once: true });
    return () => window.removeEventListener("click", unlock);
  }, []);

  // Keep the URL in sync so each screen is linkable / restorable.
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("view", view);
    history.replaceState(null, "", url.toString());
  }, [view]);

  const tasksById = new Map(v.tasks.map((t) => [t.task_id, t]));
  const moveDropped = (target: ViewType) => {
    const id = (window as unknown as { __vervoxDrag?: string }).__vervoxDrag;
    const task = id ? tasksById.get(id) : undefined;
    if (task) void v.moveTask(task, target);
  };

  const wipe = () => {
    if (!window.confirm("Delete every task on this device? This cannot be undone.")) return;
    for (const t of v.tasks) void v.removeTask(t);
  };

  const requestPermission = (kind: "notifications" | "media") => {
    setPermissionKind(kind);
  };

  const allowPermission = async () => {
    if (permissionKind === "notifications") {
      await requestNotificationPermission();
    }
    setPermissionKind(null);
  };

  const completedToday = v.todayTasks.filter((t) => t.is_completed);
  const personalTasks = v.tasks.filter((t) => (t.scope ?? "personal") === "personal" && t.creator_hardware_id === v.deviceId);
  const activePairId = v.partners[0] ? pairId(v.deviceId, v.partners[0]) : null;
  const scopedPartnerTasks = v.tasks.filter((t) => t.scope === "partner" && t.partner_pair_id === activePairId);
  const scopedPodTasks = v.tasks.filter((t) => t.scope === "pod" && t.pod_id === v.pods[0]?.pod_id);
  const meta = META[view];

  const views: NavItem[] = [
    {
      key: "all",
      label: "All Tasks",
      hint: "Today + scheduled",
      icon: <IconInbox width={17} height={17} />,
      count: personalTasks.filter((t) => !t.is_completed).length,
      dropView: null,
    },
    {
      key: "today",
      label: "Today's Tasks",
      hint: "Due right now",
      icon: <IconSun width={17} height={17} />,
      count: personalTasks.filter((t) => t.view_type === "today" && !t.is_completed).length,
      dropView: "today",
    },
    {
      key: "scheduled",
      label: "Scheduled Tasks",
      hint: "Queued for later",
      icon: <IconCalendar width={17} height={17} />,
      count: personalTasks.filter((t) => t.view_type === "scheduled" && !t.is_completed).length,
      dropView: "scheduled",
    },
    {
      key: "partner",
      label: v.partnerName ? `Partner: @${v.partnerName}` : "Partner Focus",
      hint: "1-on-1 Dual Focus",
      icon: <IconLink width={17} height={17} />,
      count: scopedPartnerTasks.filter((t) => !t.is_completed).length,
      dropView: null,
    },
    {
      key: "pods",
      label: "Group Pods",
      hint: v.pods.length > 0 ? `${v.pods.length} Active` : "3–6 Members",
      icon: <IconUsers width={17} height={17} />,
      count: scopedPodTasks.filter((t) => !t.is_completed).length,
      dropView: null,
    },
  ];

  const nextUp = sortByDateTime(v.scheduledTasks)[0];
  const bodyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (view === "all") return;
    moveDropped(view);
  };

  return (
    <div className="min-h-dvh bg-[var(--vx-bg)] text-slate-900 antialiased">
      <div className="vx-glow pointer-events-none fixed inset-0" />

      <NavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        views={views}
        active={view}
        onChange={setView}
        onDropTask={moveDropped}
        mode={v.mode}
        paired={v.partners.length > 0}
        partnerName={v.partnerName}
        onOpenPair={() => setPairOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="relative lg:pl-64">
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-44">
          {/* Header */}
          <header className="sticky top-0 z-30 -mx-4 mb-3 bg-[var(--vx-bg)]/85 px-4 pt-5 pb-3 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  onClick={() => setMenuOpen(true)}
                  aria-label="Open navigation"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 lg:hidden"
                >
                  <IconMenu width={18} height={18} />
                </button>
                <div className="min-w-0">
                  <h1
                    className="truncate text-[19px] font-bold tracking-tight text-slate-900"
                    title="Vervox"
                  >
                    {meta.title}
                  </h1>
                  <p className="truncate text-[11px] text-slate-500">
                    {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  title={v.mode === "firebase" ? "Cloud Firestore sync" : "On-device offline engine"}
                  className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 sm:flex ${
                    !v.online
                      ? "bg-amber-50 text-amber-700 ring-amber-200"
                      : v.mode === "firebase"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-white text-slate-500 ring-slate-200"
                  }`}
                >
                  <IconCloud width={12} height={12} />
                  {!v.online ? `offline${v.pending ? ` · ${v.pending}` : ""}` : v.mode === "firebase" ? "live" : "offline"}
                </span>
                <button
                  onClick={() => setPodOpen(true)}
                  className={`grid h-9 w-9 place-items-center rounded-xl ring-1 transition ${
                    v.pods.length
                      ? "bg-indigo-50 text-indigo-600 ring-indigo-200"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                  aria-label="Group pods"
                >
                  <IconUsers width={17} height={17} />
                </button>
                <button
                  onClick={() => setPairOpen(true)}
                  className={`grid h-9 w-9 place-items-center rounded-xl ring-1 transition lg:hidden ${
                    v.partners.length
                      ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                  aria-label="Link partner"
                >
                  <IconLink width={17} height={17} />
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 lg:hidden"
                  aria-label="Settings"
                >
                  <IconSettings width={17} height={17} />
                </button>
              </div>
            </div>

            {/* Progress / summary */}
            {view === "scheduled" ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
                <p className="text-[13px] font-semibold text-slate-900">
                  {v.scheduledTasks.length} task{v.scheduledTasks.length === 1 ? "" : "s"} queued
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {nextUp?.schedule?.date
                    ? `Next up: ${prettyDate(nextUp.schedule.date)}${nextUp.schedule.time ? ` at ${nextUp.schedule.time}` : ""} — ${nextUp.title}`
                    : "Anything you schedule migrates into Today's Tasks at midnight."}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-slate-900">
                    {v.progress.done} of {v.progress.total} tasks completed
                    <span className="ml-1.5 text-violet-300">— {v.progress.pct}%</span>
                  </p>
                  {completedToday.length > 0 && (
                    <button
                      onClick={() => completedToday.forEach((t) => void v.archiveTask(t))}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      <IconArchive width={11} height={11} /> Archive done
                    </button>
                  )}
                </div>
                <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="vx-gradient h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${v.progress.pct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Resets at midnight · completions auto-archive</span>
                  <span>{v.partners.length ? "Shared with partner" : "Solo mode"}</span>
                </div>
              </div>
            )}
          </header>

          {/* Lists */}
          <main className="flex-1 space-y-3" onDragOver={(e) => e.preventDefault()} onDrop={bodyDrop}>
            {!v.ready && <Skeleton />}

            {v.ready && view === "all" && (
              <>
                {personalTasks.filter((t) => t.view_type === "today" || t.view_type === "scheduled").length === 0 && <Empty title={meta.emptyTitle} body={meta.emptyBody} />}
                {sortByDateTime(personalTasks.filter((t) => t.view_type === "today" || t.view_type === "scheduled")).map((t) => (
                  <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                ))}
              </>
            )}

            {v.ready && view === "today" && (
              <>
                {personalTasks.filter((t) => t.view_type === "today").length === 0 && <Empty title={meta.emptyTitle} body={meta.emptyBody} />}
                {personalTasks.filter((t) => t.view_type === "today").map((t) => (
                  <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                ))}
              </>
            )}

            {v.ready && view === "scheduled" && (
              <>
                {v.scheduledGroups.filter(([, list]) => list.some((t) => personalTasks.some((personal) => personal.task_id === t.task_id))).length === 0 && <Empty title={meta.emptyTitle} body={meta.emptyBody} />}
                {v.scheduledGroups.map(([date, list]) => {
                  const personalList = list.filter((t) => personalTasks.some((personal) => personal.task_id === t.task_id));
                  if (!personalList.length) return null;
                  return (
                  <section key={date}>
                    <h3 className="vx-scheduled-heading sticky top-[12.5rem] z-10 mb-2 flex items-center gap-2 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-500 backdrop-blur">
                      {date === "unscheduled" ? "No date" : prettyGroup(date)}
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-slate-600">{list.length}</span>
                    </h3>
                    <div className="space-y-2.5">
                      {sortTasks(personalList).map((t) => (
                        <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                      ))}
                    </div>
                  </section>
                  );
                })}
              </>
            )}

            {/* ── Partner Dual-Focus View ─────────────────────── */}
            {v.ready && view === "partner" && (() => {
              const myTasks = sortTasks(scopedPartnerTasks.filter((t) => t.created_by === v.deviceId && !t.is_completed));
              const partnerTasks = sortTasks(scopedPartnerTasks.filter((t) => t.created_by !== v.deviceId && !t.is_completed));
              const hasPartner = v.partners.length > 0;
              if (!hasPartner && myTasks.length === 0 && partnerTasks.length === 0) {
                return <Empty title={meta.emptyTitle} body={meta.emptyBody} />;
              }
              return (
                <div className="space-y-5">
                  {/* My Focus */}
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
                        {(v.name?.[0] ?? "Y").toUpperCase()}
                      </span>
                      My Focus — @{v.name || "You"}
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-slate-600">{myTasks.length}</span>
                    </h3>
                    {myTasks.length === 0 && (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-center text-[12px] text-slate-500">
                        You have no active tasks right now.
                      </p>
                    )}
                    <div className="space-y-2.5">
                      {myTasks.map((t) => (
                        <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                      ))}
                    </div>
                  </section>

                  {/* Partner Focus */}
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                        {(v.partnerName?.[0] ?? "P").toUpperCase()}
                      </span>
                      Partner Focus — @{v.partnerName || "Partner"}
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-slate-600">{partnerTasks.length}</span>
                    </h3>
                    {partnerTasks.length === 0 && (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-center text-[12px] text-slate-500">
                        {hasPartner ? "Your partner has no active tasks." : "Link a partner to see their tasks here."}
                      </p>
                    )}
                    <div className="space-y-2.5">
                      {partnerTasks.map((t) => (
                        <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                      ))}
                    </div>
                    {hasPartner && partnerTasks.length > 0 && (
                      <button
                        onClick={() => {
                          for (const t of partnerTasks.slice(0, 1)) void v.sendNudge(t);
                        }}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-50 py-2.5 text-[12px] font-semibold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
                      >
                        🔔 Nudge Partner
                      </button>
                    )}
                  </section>
                </div>
              );
            })()}

            {/* ── Pods Workspace View ─────────────────────────── */}
            {v.ready && view === "pods" && (() => {
              const podTasks = sortTasks(scopedPodTasks.filter((t) => !t.is_completed));
              if (v.pods.length === 0 && podTasks.length === 0) {
                return <Empty title={meta.emptyTitle} body={meta.emptyBody} />;
              }
              return (
                <div className="space-y-4">
                  {/* Pod switcher header */}
                  {v.pods.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {v.pods.map((pod) => (
                        <span
                          key={pod.pod_id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-[12px] font-semibold text-violet-800 ring-1 ring-violet-200"
                        >
                          👥 {pod.name}
                          <span className="rounded-md bg-violet-200/60 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            {pod.members.length}/{pod.max_members}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {podTasks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center">
                      <p className="text-[13px] font-semibold text-slate-700">No pod tasks yet</p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        Add a task below — it'll be tagged to your active pod automatically.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {podTasks.map((t) => (
                      <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                    ))}
                  </div>

                  {podTasks.length > 0 && v.shareTargets.length > 0 && (
                    <button
                      onClick={() => {
                        for (const t of podTasks.slice(0, 1)) void v.sendNudge(t);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-50 py-2.5 text-[12px] font-semibold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100"
                    >
                      🔔 Nudge Pod
                    </button>
                  )}
                </div>
              );
            })()}

            {!iosInstallDismissed && (
              <div id="ios-install-banner" className="mb-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg">📱</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-900">Install Vervox on iOS</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">
                      To install Vervox on iOS, tap the Share icon{" "}
                      <span className="font-semibold text-slate-900">⎋</span> and select “Add to Home Screen”{" "}
                      <span className="font-semibold text-slate-900">➕</span>
                    </p>
                  </div>
                  <button
                    id="ios-install-dismiss"
                    className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Dismiss install instructions"
                    onClick={() => {
                      localStorage.setItem("vervox:ios-install-dismissed", "1");
                      setIosInstallDismissed(true);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <Prompts onNotify={(message, tone) => v.pushToast(message, tone ?? "info")} />
          </main>
        </div>
      </div>

      {/* Composer */}
      <div className="vx-composer-dock fixed inset-x-0 bottom-0 z-40 pt-4">
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pl-[calc(16rem+1rem)]">
          <TaskComposer
            variant={view}
            onAdd={v.addTask}
            onNotify={(message, tone) => v.pushToast(message, tone ?? "info")}
            activePod={activePod}
            pods={v.pods}
            partnerAvailable={v.partners.length > 0}
            onRequestPermission={requestPermission}
          />
          <p className="mt-2 text-center text-[10px] text-slate-400">
            {view === "today"
              ? "Saved straight to today · tap to reveal ✓ / ✗ · double-tap to edit"
              : view === "scheduled"
                ? "Date & time required here · drag a task onto the menu to move it"
                : "Tap to reveal ✓ / ✗ · double-tap to edit · drag onto the menu to move"}
          </p>
        </div>
      </div>

      <PodSheet
        open={podOpen}
        onClose={() => setPodOpen(false)}
        pods={v.pods}
        unlocked={v.entitlements.pods}
        deviceId={v.deviceId}
        pairLock={v.pairLock}
        attempts={v.pairAttempts}
        onCreate={v.createPod}
        onJoin={v.joinPod}
        onInvite={v.inviteToPod}
        onLeave={v.leavePod}
        onOpenSecondDevice={v.openSecondDevice}
      />

      <MediaCapture
        open={!!mediaTask}
        task={mediaTask}
        hasAccess={v.entitlements.cloudMedia}
        onClose={() => setMediaTask(null)}
        onAttach={(patch) => (mediaTask ? v.attachMedia(mediaTask, patch) : Promise.resolve())}
        onClear={(kind) => (mediaTask ? v.clearMedia(mediaTask, kind) : Promise.resolve())}
      />

      <Onboarding
        open={showOnboarding && v.ready}
        onDismiss={() => {
          localStorage.setItem("vervox:onboarded", "1");
          setShowOnboarding(false);
        }}
      />

      {/* One-time username claim — mandatory on first open */}
      <UsernameModal open={showUsername} onConfirm={handleClaimUsername} />

      <Toasts toasts={v.toasts} onDismiss={v.dismissToast} />

      <PairingModal
        open={pairOpen}
        onClose={() => setPairOpen(false)}
        mode={v.mode}
        deviceId={v.deviceId}
        uid={v.uid}
        partners={v.partners}
        pairLock={v.pairLock}
        attempts={v.pairAttempts}
        onGenerate={v.generateCode}
        onJoin={v.joinCode}
        onUnpair={v.unpair}
        onOpenSecondDevice={v.openSecondDevice}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={v.mode}
        currency={v.currency}
        partners={v.partners}
        pods={v.pods.length}
        archivedCount={v.archived.length}
        completedCount={completedToday.length}
        entitlements={v.entitlements}
        themeId={v.themeId}
        chimeId={v.chimeId}
        name={v.name}
        onTheme={v.setThemeId}
        onChime={v.setChimeId}
        onName={(value) => void v.updateName(value)}
        onArchiveCompleted={() => {
          if (!completedToday.length) {
            v.pushToast("Nothing completed yet to archive.", "info");
            return;
          }
          completedToday.forEach((t) => void v.archiveTask(t));
          v.pushToast(`Archived ${completedToday.length} completed task${completedToday.length === 1 ? "" : "s"}.`, "success");
        }}
        onWipe={wipe}
      />

      <NativePermissionPrompt
        open={permissionKind !== null}
        kind={permissionKind ?? "notifications"}
        onAllow={() => void allowPermission()}
        onCancel={() => setPermissionKind(null)}
      />
    </div>
  );
}

function TaskRow({
  v,
  task,
  view,
  onProof,
}: {
  v: ReturnType<typeof useVervox>;
  task: Task;
  view: AppView;
  onProof: (task: Task) => void;
}) {
  return (
    <div
      onDragStart={() => {
        (window as unknown as { __vervoxDrag?: string }).__vervoxDrag = task.task_id;
      }}
      onDragEnd={() => {
        (window as unknown as { __vervoxDrag?: string }).__vervoxDrag = undefined;
      }}
      className={view === "all" && task.view_type === "scheduled" ? "relative" : undefined}
    >
      {view === "all" && task.view_type === "scheduled" && (
        <span className="mb-1 ml-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {task.schedule?.date === todayKey() ? "Scheduled · today" : `Scheduled · ${prettyDate(task.schedule?.date ?? "")}`}
        </span>
      )}
      <TaskItem
        task={task}
        mine={task.created_by === v.deviceId}
        authorName={v.memberNames.get(task.created_by)}
        hasMediaAccess={v.entitlements.cloudMedia}
        canNudge={v.shareTargets.length > 0}
        onProof={onProof}
        onNudge={(t) => void v.sendNudge(t)}
        onToggle={(t) => void v.toggleComplete(t)}
        onDelete={(t) => void v.removeTask(t)}
        onPatch={(id, patch) => void v.patchTask(id, patch)}
        onMove={(t, target) => void v.moveTask(t, target)}
        onAddSubtask={(t, title) => void v.addSubtask(t, title)}
        onToggleSubtask={(t, subId) => void v.toggleSubtask(t, subId)}
        onRemoveSubtask={(t, subId) => void v.removeSubtask(t, subId)}
      />
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}
