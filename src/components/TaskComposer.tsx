import { useEffect, useRef, useState } from "react";
import { IconBell, IconCalendar, IconMapPin, IconMic, IconPlus, IconSun } from "@/components/Icons";
import { speechSupported, startDictation } from "@/lib/speech";
import { describeParsed, parseTaskInput, type ParsedTask } from "@/lib/nlp";
import { addDays, nowTime, todayKey } from "@/lib/utils";
import { playUndoChime } from "@/lib/audio";
import type { AppView, Pod, Priority, TaskScope } from "@/lib/types";
import type { NewTaskInput } from "@/hooks/useVervox";

interface Props {
  /** The active screen decides which version of the form is rendered. */
  variant: AppView;
  onAdd: (input: NewTaskInput) => Promise<unknown>;
  onNotify: (message: string, tone?: "info" | "success" | "danger") => void;
  activePod?: Pod | null;
  pods?: Pod[];
  partnerAvailable?: boolean;
  onRequestPermission?: (kind: "notifications" | "media") => void;
}

const PRIORITIES: Priority[] = ["low", "normal", "high"];

export default function TaskComposer({ variant, onAdd, onNotify, activePod, pods = [], partnerAvailable = false, onRequestPermission }: Props) {
  const [title, setTitle] = useState("");
  const [podTag, setPodTag] = useState<string>("@All");
  const [scope, setScope] = useState<TaskScope>("personal");
  const [selectedPodId, setSelectedPodId] = useState("");
  const [scheduleIt, setScheduleIt] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(nowTime());
  const [alarm, setAlarm] = useState(false);
  const [priority, setPriority] = useState<Priority>("normal");
  const [location, setLocation] = useState<{ lat: number; lng: number; label?: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedTask | null>(null);
  const stopFn = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the form (and its defaults) whenever the active screen changes.
  useEffect(() => {
    setParsed(null);
    setScheduleIt(variant === "scheduled");
    setDate(variant === "scheduled" ? addDays(todayKey(), 1) : todayKey());
    setTime(nowTime());
    setAlarm(false);
    setLocation(null);
    setOpen(variant === "scheduled");
    setScope("personal");
    setSelectedPodId(pods[0]?.pod_id ?? "");
  }, [pods, variant]);

  useEffect(() => () => stopFn.current?.(), []);

  /** Home = toggleable. Today = never. Scheduled = always. */
  const showDateTime = variant === "scheduled" || (variant === "all" && scheduleIt);
  const showToggle = variant === "all";
  const parsedLabel = parsed ? describeParsed(parsed) : null;

  /* Silent NLP: lift "tomorrow", "next Monday", "at 5pm" out of the sentence
     and push them into the form state without interrupting typing. */
  const handleTitle = (value: string) => {
    setTitle(value);
    const result = parseTaskInput(value);
    setParsed(result);
    if (result.date) setDate(result.date);
    if (result.time) setTime(result.time);
    if (result.hasAlarm) setAlarm(true);
    if ((result.date || result.time) && variant === "all") setScheduleIt(true);
  };

  const settleTitle = () => {
    if (!parsed?.matched.length) return;
    const cleaned = parsed.title.trim();
    if (cleaned && cleaned !== title) {
      setTitle(cleaned);
      setParsed(null);
    }
  };

  const clearParsed = () => {
    setParsed(null);
    setDate(variant === "scheduled" ? addDays(todayKey(), 1) : todayKey());
    setTime(nowTime());
    setAlarm(false);
    if (variant === "all") setScheduleIt(false);
  };

  const submit = async () => {
    const value = (parsed?.matched.length ? parsed.title : title).trim();
    if (!value) return;
    const today = todayKey();
    const schedule = showDateTime
      ? { has_alarm: alarm, date: date || today, time: time || nowTime() }
      : { has_alarm: false, date: today, time: "" };
    await onAdd({
      title: value,
      view_type: "today",
      forceView: variant === "scheduled" ? "scheduled" : variant === "today" ? "today" : undefined,
      schedule,
      location,
      priority,
      scope,
      pod_id: scope === "pod" ? selectedPodId || activePod?.pod_id : null,
      tagged_members: scope === "pod" ? [podTag] : [],
    });
    playUndoChime();
    setTitle("");
    setParsed(null);
    setAlarm(false);
    setLocation(null);
    setPriority("normal");
    if (variant === "all") {
      setScheduleIt(false);
      setDate(today);
      setOpen(false);
    } else {
      setDate(variant === "scheduled" ? addDays(today, 1) : today);
    }
    inputRef.current?.focus();
  };

  const toggleMic = () => {
    if (listening) {
      stopFn.current?.();
      setListening(false);
      return;
    }
    if (!speechSupported()) {
      onNotify("Voice input isn't supported in this browser.", "danger");
      return;
    }
    setListening(true);
    stopFn.current = startDictation({
      onInterim: (text) => handleTitle(text),
      onFinal: (text) => handleTitle(text),
      onEnd: () => setListening(false),
      onError: (err) => {
        setListening(false);
        onNotify(err === "not-allowed" ? "Microphone permission denied." : "Voice input unavailable.", "danger");
      },
    });
    if (!stopFn.current) setListening(false);
  };

  const tagLocation = () => {
    if (!navigator.geolocation) {
      onNotify("Geolocation isn't available here.", "danger");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          label: "Tagged here",
        });
        setLocating(false);
        onNotify("Location tagged.", "success");
      },
      () => {
        setLocating(false);
        onNotify("Location permission denied.", "danger");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const placeholder =
    variant === "today" ? "Add to today..." : variant === "scheduled" ? "Schedule a task..." : "Add a task...";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/60">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => handleTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          onBlur={settleTitle}
          onFocus={() => setOpen(true)}
          placeholder={listening ? "Listening..." : placeholder}
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
        />
        <button
          onClick={toggleMic}
          aria-label="Dictate task"
          className={`grid h-9 w-9 place-items-center rounded-xl transition ${
            listening
              ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200 animate-pulse"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <IconMic width={17} height={17} />
        </button>
        <button
          onClick={() => void submit()}
          disabled={!title.trim()}
          aria-label="Add task"
          className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-30"
        >
          <IconPlus width={18} height={18} />
        </button>
      </div>

      {(open || variant !== "all") && (
        <label className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[12px] font-semibold text-slate-700">
          <span>Share target</span>
          <select
            value={scope}
            onChange={(e) => {
              const value = e.target.value;
              if (value.startsWith("pod:")) {
                setScope("pod");
                setSelectedPodId(value.slice(4));
              } else {
                setScope(value as TaskScope);
              }
            }}
            className="max-w-[70%] rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 outline-none ring-1 ring-slate-200 focus:ring-indigo-400"
          >
            <option value="personal">Personal (Only Me)</option>
            <option value="partner" disabled={!partnerAvailable}>Send to Partner{partnerAvailable ? "" : " (not paired)"}</option>
            {pods.map((pod) => (
              <option key={pod.pod_id} value={`pod:${pod.pod_id}`}>Send to Pod: {pod.name}</option>
            ))}
          </select>
        </label>
      )}

      {scope === "pod" && pods.length > 0 && (
        <label className="mt-2 flex items-center justify-between gap-3 text-[11px] text-violet-800">
          <span>Pod workspace</span>
          <select value={selectedPodId} onChange={(e) => setSelectedPodId(e.target.value)} className="rounded-lg bg-violet-50 px-2 py-1 font-semibold ring-1 ring-violet-200">
            {pods.map((pod) => <option key={pod.pod_id} value={pod.pod_id}>{pod.name}</option>)}
          </select>
        </label>
      )}

      {parsedLabel && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] text-indigo-700 ring-1 ring-indigo-200">
          <span className="shrink-0 font-semibold uppercase tracking-wide">Understood</span>
          <span className="shrink-0 font-semibold">{parsedLabel}</span>
          <span className="min-w-0 flex-1 truncate text-indigo-500">Task name: {parsed?.title.trim() || title}</span>
          <button onClick={clearParsed} className="shrink-0 text-indigo-400 hover:text-indigo-700" aria-label="Clear parsed date">
            ✕
          </button>
        </div>
      )}

      {showToggle && open && (
        <label className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-[13px] text-slate-700">
          <input
            type="checkbox"
            checked={scheduleIt}
            onChange={(e) => setScheduleIt(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Schedule this task
          <span className="ml-auto text-[11px] text-slate-500">
            {scheduleIt ? "Pick a date & time" : "Defaults to today"}
          </span>
        </label>
      )}

      {showDateTime && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-indigo-400 [color-scheme:light]"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-28 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-indigo-400 [color-scheme:light]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (!alarm && typeof Notification !== "undefined" && Notification.permission === "default") {
                  onRequestPermission?.("notifications");
                  return;
                }
                setAlarm((v) => !v);
              }}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                alarm
                  ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <IconBell width={12} height={12} className="mr-1 inline" />
              Alarm
            </button>
            <button
              onClick={tagLocation}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                location
                  ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <IconMapPin width={12} height={12} className="mr-1 inline" />
              {locating ? "Locating..." : location ? "Location tagged" : "Tag location"}
            </button>
            <span className="ml-auto text-[11px]">
              {date > todayKey() ? (
                <span className="font-semibold text-indigo-600">Queues in Scheduled</span>
              ) : (
                <span className="flex items-center gap-1 font-semibold text-emerald-600">
                  <IconSun width={11} height={11} /> Lands in Today
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {activePod && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-violet-50/80 px-3 py-2 ring-1 ring-violet-200/70">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">🏷️</span>
            <span className="text-[11.5px] font-semibold text-violet-900">Tag in {activePod.name}:</span>
          </div>
          <select
            value={podTag}
            onChange={(e) => setPodTag(e.target.value)}
            className="rounded-lg border-0 bg-white px-2.5 py-1 text-[11px] font-bold text-violet-700 shadow-sm outline-none ring-1 ring-violet-200 focus:ring-2 focus:ring-violet-400"
          >
            <option value="@All">📢 @All Members</option>
            {activePod.members.map((m) => (
              <option key={m.device_id} value={`@${m.name || "Member"}`}>
                👤 @{m.name || "Member"}
              </option>
            ))}
          </select>
        </div>
      )}

      {(open || variant !== "all") && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-1 ring-1 ring-slate-200">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                  priority === p ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            {variant === "scheduled" ? (
              <>
                <IconCalendar width={11} height={11} /> Always dated
              </>
            ) : variant === "today" ? (
              <>
                <IconSun width={11} height={11} /> Saved to today
              </>
            ) : (
              <button onClick={() => setOpen(false)} className="font-semibold text-slate-400 hover:text-slate-600">
                Collapse
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
