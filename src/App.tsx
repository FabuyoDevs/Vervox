import { useEffect, useState } from "react";
import InstallModal from "@/components/InstallModal";
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

const VALID: AppView[] = ["all", "today", "scheduled"];
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
};

export default function App() {
  const v = useVervox();
  const [view, setView] = useState<AppView>(readView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [mediaTask, setMediaTask] = useState<Task | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem("vervox:onboarded") !== "1");

  const requestProof = (task: Task) => {
    setMediaTask(task);
  };

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
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

  const completedToday = v.todayTasks.filter((t) => t.is_completed);
  const meta = META[view];

  const views: NavItem[] = [
    {
      key: "all",
      label: "All Tasks",
      hint: "Today + scheduled",
      icon: <IconInbox width={17} height={17} />,
      count: v.tasks.filter((t) => !t.is_completed).length,
      dropView: null,
    },
    {
      key: "today",
      label: "Today's Tasks",
      hint: "Due right now",
      icon: <IconSun width={17} height={17} />,
      count: v.todayTasks.filter((t) => !t.is_completed).length,
      dropView: "today",
    },
    {
      key: "scheduled",
      label: "Scheduled Tasks",
      hint: "Queued for later",
      icon: <IconCalendar width={17} height={17} />,
      count: v.scheduledTasks.length,
      dropView: "scheduled",
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
        onOpenPair={() => setPairOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenInstall={() => setInstallOpen(true)}
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
                {v.allTasks.length === 0 && <Empty title={meta.emptyTitle} body={meta.emptyBody} />}
                {v.allTasks.map((t) => (
                  <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                ))}
              </>
            )}

            {v.ready && view === "today" && (
              <>
                {v.todayTasks.length === 0 && <Empty title={meta.emptyTitle} body={meta.emptyBody} />}
                {v.todayTasks.map((t) => (
                  <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                ))}
              </>
            )}

            {v.ready && view === "scheduled" && (
              <>
                {v.scheduledGroups.length === 0 && <Empty title={meta.emptyTitle} body={meta.emptyBody} />}
                {v.scheduledGroups.map(([date, list]) => (
                  <section key={date}>
                    <h3 className="sticky top-[12.5rem] z-10 mb-2 flex items-center gap-2 bg-[#0f172a]/85 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-500 backdrop-blur">
                      {date === "unscheduled" ? "No date" : prettyGroup(date)}
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-slate-600">{list.length}</span>
                    </h3>
                    <div className="space-y-2.5">
                      {sortTasks(list).map((t) => (
                        <TaskRow key={t.task_id} v={v} task={t} view={view} onProof={requestProof} />
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}

            {/* iOS Safari never fires beforeinstallprompt — manual instructions. */}
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
                >
                  ✕
                </button>
              </div>
            </div>

            <Prompts onNotify={(message, tone) => v.pushToast(message, tone ?? "info")} />
          </main>
        </div>
      </div>

      {/* Composer */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-white via-white/95 to-transparent pt-6">
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pl-[calc(16rem+1rem)]">
          <TaskComposer
            variant={view}
            onAdd={v.addTask}
            onNotify={(message, tone) => v.pushToast(message, tone ?? "info")}
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

      {/* PWA Install modal — auto prompt + on-demand from hamburger menu */}
      <InstallModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onSuccess={() => v.pushToast("Vervox installed to your device!", "success")}
      />

      <Onboarding
        open={showOnboarding && v.ready}
        onDismiss={() => {
          localStorage.setItem("vervox:onboarded", "1");
          setShowOnboarding(false);
        }}
      />

      <Toasts toasts={v.toasts} onDismiss={v.dismissToast} />

      <PairingModal
        open={pairOpen}
        onClose={() => setPairOpen(false)}
        mode={v.mode}
        deviceId={v.deviceId}
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
