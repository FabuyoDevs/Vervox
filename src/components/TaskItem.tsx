import { useEffect, useRef, useState } from "react";
import { IconBell, IconCamera, IconCheck, IconFlag, IconGrip, IconMapPin, IconPlus, IconX } from "@/components/Icons";
import { resolveMediaUrl } from "@/lib/media";
import { addDays, PRIORITY_STYLE, prettyDate, todayKey } from "@/lib/utils";
import type { Priority, Task, ViewType } from "@/lib/types";

interface Props {
  task: Task;
  mine: boolean;
  authorName?: string;
  hasMediaAccess: boolean;
  canNudge: boolean;
  onProof: (t: Task) => void;
  onNudge: (t: Task) => void;
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onMove: (t: Task, view: ViewType) => void;
  onAddSubtask: (t: Task, title: string) => void;
  onToggleSubtask: (t: Task, subId: string) => void;
  onRemoveSubtask: (t: Task, subId: string) => void;
}

const PRIORITIES: Priority[] = ["low", "normal", "high"];

export default function TaskItem({
  task,
  mine,
  authorName,
  hasMediaAccess,
  canNudge,
  onProof,
  onNudge,
  onToggle,
  onDelete,
  onPatch,
  onMove,
  onAddSubtask,
  onToggleSubtask,
  onRemoveSubtask,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [draftTime, setDraftTime] = useState(task.schedule?.time ?? "");
  const [draftDate, setDraftDate] = useState(task.schedule?.date ?? "");
  const [subDraft, setSubDraft] = useState("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const clickTimer = useRef<number | null>(null);
  const lastTap = useRef(0);
  const lastDouble = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [deferOpen, setDeferOpen] = useState(false);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  // Media lives in Firebase Storage (https) or IndexedDB (`idb:` refs).
  useEffect(() => {
    let cancelled = false;
    void resolveMediaUrl(task.media?.proof_image_url).then((u) => !cancelled && setImgUrl(u));
    void resolveMediaUrl(task.media?.voice_note_url).then((u) => !cancelled && setVoiceUrl(u));
    return () => {
      cancelled = true;
    };
  }, [task.media?.proof_image_url, task.media?.voice_note_url]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
    };
  }, []);

  const singleTap = () => {
    // Ignore the trailing click that follows a double-tap.
    if (Date.now() - lastDouble.current < 450) return;
    if (clickTimer.current) return;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      setEditing(false);
      setExpanded((v) => !v);
    }, 210);
  };

  const doubleTap = () => {
    if (!mine) return;
    lastDouble.current = Date.now();
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setExpanded(false);
    setDraft(task.title);
    setDraftTime(task.schedule?.time ?? "");
    setDraftDate(task.schedule?.date ?? "");
    setEditing(true);
  };

  const handleTouchEnd = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      doubleTap();
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
  };

  /* Swipe gestures (touch only): right = complete, left = defer menu. */
  const SWIPE_THRESHOLD = 70;
  const startSwipe = (e: React.TouchEvent) => {
    if (editing) return;
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    setDeferOpen(false);
  };
  const moveSwipe = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx)) {
      swipeStart.current = null;
      setDragX(0);
      return;
    }
    setDragX(Math.max(-140, Math.min(140, dx)));
  };
  const endSwipe = () => {
    const start = swipeStart.current;
    swipeStart.current = null;
    const dx = dragX;
    setDragX(0);
    handleTouchEnd();
    if (!start || editing) return;
    if (dx > SWIPE_THRESHOLD && !task.is_completed) onToggle(task);
    else if (dx < -SWIPE_THRESHOLD) setDeferOpen(true);
  };

  const defer = (days: number) => {
    const baseDate = task.schedule?.date ?? todayKey();
    const nextDate = addDays(baseDate < todayKey() ? todayKey() : baseDate, days);
    onPatch(task.task_id, {
      view_type: "scheduled",
      schedule: {
        has_alarm: task.schedule?.has_alarm ?? false,
        date: nextDate,
        time: task.schedule?.time ?? "",
      },
    });
    setDeferOpen(false);
  };

  const commitEdit = () => {
    const title = draft.trim();
    const patch: Partial<Task> = {};
    if (title && title !== task.title) patch.title = title;
    const hasAny = !!draftDate || !!draftTime;
    if (hasAny) {
      patch.schedule = {
        has_alarm: task.schedule?.has_alarm ?? false,
        date: draftDate || task.schedule?.date || "",
        time: draftTime || task.schedule?.time || "",
      };
    } else if (task.schedule && !draftDate && !draftTime) {
      patch.schedule = null;
    }
    if (draftTime && draftTime !== task.schedule?.time && task.schedule) patch.schedule = { ...task.schedule, time: draftTime };
    if (Object.keys(patch).length) onPatch(task.task_id, patch);
    setEditing(false);
  };

  const done = task.subtasks.filter((s) => s.done).length;

  if (editing) {
    return (
      <div className="rounded-2xl border border-indigo-300 bg-white p-3 shadow-lg shadow-indigo-500/10">
        <input
          ref={titleRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
          placeholder="Task title"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-indigo-400 [color-scheme:light]"
          />
          <input
            type="time"
            value={draftTime}
            onChange={(e) => setDraftTime(e.target.value)}
            className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-indigo-400 [color-scheme:light]"
          />
          <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-1 ring-1 ring-slate-200">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => onPatch(task.task_id, { priority: p })}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition ${
                  task.priority === p ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={commitEdit}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Swipe rails — only visible while dragging or when the defer menu opens */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 flex items-center rounded-2xl bg-emerald-500 px-4 text-white transition-opacity ${
          dragX > 20 ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: `${Math.max(0, dragX)}px` }}
      >
        <IconCheck width={18} height={18} strokeWidth={3} />
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end rounded-2xl bg-indigo-500 px-4 text-white transition-opacity ${
          dragX < -20 || deferOpen ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: `${Math.max(0, -dragX)}px` }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider">Defer</span>
      </div>

    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/vervox-task", task.task_id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={singleTap}
      onDoubleClick={doubleTap}
      onTouchStart={startSwipe}
      onTouchMove={moveSwipe}
      onTouchEnd={endSwipe}
      style={{ touchAction: "pan-y", transform: dragX ? `translateX(${dragX}px)` : undefined }}
      className={`vx-smooth group relative select-none rounded-2xl border bg-white p-3 shadow-sm transition active:scale-[0.99] ${
        task.is_completed ? "border-emerald-100 bg-emerald-50/50" : "border-slate-200 hover:border-indigo-300"
      } ${expanded ? "ring-2 ring-indigo-200" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label={task.is_completed ? "Mark incomplete" : "Mark complete"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task);
          }}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
            task.is_completed
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 hover:border-indigo-500"
          }`}
        >
          {task.is_completed && <IconCheck width={14} height={14} strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[15px] font-medium leading-snug ${
              task.is_completed ? "text-slate-400 line-through" : "text-slate-900"
            }`}
          >
            {task.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {task.schedule?.time && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                {task.schedule.time}
              </span>
            )}
            {task.view_type === "scheduled" && task.schedule?.date && (
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700">
                {prettyDate(task.schedule.date)}
              </span>
            )}
            <span className={`rounded-md px-1.5 py-0.5 font-semibold capitalize ring-1 ${PRIORITY_STYLE[task.priority]}`}>
              {task.priority}
            </span>
            {task.schedule?.has_alarm && (
              <span className="grid h-5 w-5 place-items-center rounded-md bg-amber-50 text-amber-600">
                <IconBell width={12} height={12} />
              </span>
            )}
            {task.optional_location && (
              <a
                href={`https://maps.google.com/?q=${task.optional_location.lat},${task.optional_location.lng}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="grid h-5 w-5 place-items-center rounded-md bg-sky-50 text-sky-600"
                title={task.optional_location.label ?? "Tagged location"}
              >
                <IconMapPin width={12} height={12} />
              </a>
            )}
            {task.subtasks.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubs((v) => !v);
                  setExpanded(true);
                }}
                className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-200"
              >
                {done}/{task.subtasks.length} subtasks
              </button>
            )}
            {/* Member avatar badge: Creator */}
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 pl-1 pr-2 py-0.5 text-[11px] font-semibold text-slate-700">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
                {((task.creator_username || authorName || task.created_by_name || "U")[0] || "U").toUpperCase()}
              </span>
              <span>@{task.creator_username || authorName || task.created_by_name || "Creator"}{mine ? " (You)" : ""}</span>
            </span>

            {/* Pod Tagged Members */}
            {task.tagged_members && task.tagged_members.length > 0 && (
              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700 ring-1 ring-violet-200/60">
                🏷️ {task.tagged_members.join(", ")}
              </span>
            )}

            {/* Member avatar badge: Completer */}
            {task.is_completed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 pl-1 pr-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                  ✓
                </span>
                <span>Done by @{task.completed_by_name || (task.completed_by === task.created_by ? (mine ? "You" : (task.creator_username || "Creator")) : (mine ? (authorName || "Partner") : "You"))}</span>
              </span>
            )}
          </div>

          {(imgUrl || voiceUrl) && (
            <div className="mt-2 flex items-center gap-2">
              {imgUrl && (
                <img src={imgUrl} alt="Proof" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
              )}
              {voiceUrl && <audio src={voiceUrl} controls className="h-9 min-w-0 flex-1" />}
            </div>
          )}
        </div>

        <span className="mt-1 cursor-grab text-slate-300 group-hover:text-slate-400">
          <IconGrip width={16} height={16} />
        </span>
      </div>

      {(showSubs || (expanded && task.subtasks.length > 0)) && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
          {task.subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtask(task, s.id);
                }}
                className={`grid h-4 w-4 place-items-center rounded border ${
                  s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"
                }`}
              >
                {s.done && <IconCheck width={10} height={10} strokeWidth={4} />}
              </button>
              <span className={`flex-1 text-[13px] ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                {s.title}
              </span>
              {mine && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSubtask(task, s.id);
                  }}
                  className="text-slate-400 hover:text-rose-500"
                  aria-label="Remove subtask"
                >
                  <IconX width={14} height={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(task);
                setExpanded(false);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white ring-1 transition ${
                task.is_completed
                  ? "bg-slate-600 ring-slate-600 hover:bg-slate-700"
                  : "bg-emerald-500 ring-emerald-500 hover:bg-emerald-600"
              }`}
            >
              <IconCheck width={16} height={16} />
              {task.is_completed ? "Reopen" : "Complete"}
            </button>
            {mine && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(task);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-50 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-100"
              >
                <IconX width={16} height={16} />
                Delete
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mine && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                  setExpanded(false);
                }}
                className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                Edit
              </button>
            )}
            {mine && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(task, task.view_type === "today" ? "scheduled" : "today");
                }}
                className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                Move to {task.view_type === "today" ? "Scheduled" : "Today"}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onProof(task);
              }}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                hasMediaAccess
                  ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                  : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <IconCamera width={12} height={12} className="mr-1 inline" />
              Proof
            </button>
            {canNudge && !task.is_completed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNudge(task);
                }}
                className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
              >
                <IconBell width={12} height={12} className="mr-1 inline" />
                Nudge
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSubs((v) => !v);
              }}
              className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              {showSubs ? "Hide subtasks" : "Subtasks"}
            </button>
            {mine && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next: Priority = task.priority === "high" ? "low" : task.priority === "low" ? "normal" : "high";
                    onPatch(task.task_id, { priority: next });
                  }}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  <IconFlag width={12} height={12} className="mr-1 inline" />
                  {task.priority}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPatch(task.task_id, {
                      schedule: task.schedule
                        ? { ...task.schedule, has_alarm: !task.schedule.has_alarm }
                        : { has_alarm: true, date: "", time: "" },
                    });
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    task.schedule?.has_alarm
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <IconBell width={12} height={12} className="mr-1 inline" />
                  Alarm
                </button>
              </>
            )}
          </div>

          {showSubs && mine && (
            <div className="flex items-center gap-2">
              <input
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && subDraft.trim()) {
                    onAddSubtask(task, subDraft);
                    setSubDraft("");
                  }
                }}
                placeholder="Add a micro-step…"
                className="flex-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-indigo-400"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (subDraft.trim()) {
                    onAddSubtask(task, subDraft);
                    setSubDraft("");
                  }
                }}
                className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-100"
                aria-label="Add subtask"
              >
                <IconPlus width={14} height={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>

      {deferOpen && (
        <div
          className="absolute inset-x-0 -bottom-1 z-10 flex translate-y-full flex-wrap items-center justify-end gap-1.5 rounded-b-2xl border border-t-0 border-indigo-200 bg-white p-2 shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="mr-auto pl-1.5 text-[11px] font-semibold text-slate-500">Defer to</span>
          {[
            { label: "+1 Day", days: 1 },
            { label: "+2 Days", days: 2 },
            { label: "Next Week", days: 7 },
          ].map(({ label, days }) => (
            <button
              key={label}
              onClick={() => defer(days)}
              className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setDeferOpen(false)}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700"
            aria-label="Cancel defer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
