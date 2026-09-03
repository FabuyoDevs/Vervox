import { useEffect, useState } from "react";
import { IconArchive, IconCheck, IconCloud, IconSettings, IconX } from "@/components/Icons";
import { isMuted, playCompleteChime, setMuted } from "@/lib/audio";
import type { Currency } from "@/lib/billing";
import { CHIME_PACKS, THEMES } from "@/lib/themes";
import { notificationsEnabled, requestNotificationPermission, setNotificationsEnabled, subscribeToPush } from "@/lib/pwa";
import { DEFAULT_QUIET, loadQuietHours, saveQuietHours, type QuietHours } from "@/lib/utils";
import type { Entitlements } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: "firebase" | "local";
  partners: string[];
  pods: number;
  archivedCount: number;
  completedCount: number;
  entitlements: Entitlements;
  currency: Currency;
  themeId: string;
  chimeId: string;
  name: string;
  onTheme: (id: string) => void;
  onChime: (id: string) => void;
  onName: (value: string) => void;
  onRestorePurchases?: () => void;
  onOpenStore?: () => void;
  onArchiveCompleted: () => void;
  onWipe: () => void;
}

export default function SettingsSheet({
  open,
  onClose,
  mode,
  partners,
  pods,
  archivedCount,
  completedCount,
  entitlements,
  currency,
  themeId,
  chimeId,
  name,
  onTheme,
  onChime,
  onName,
  onRestorePurchases,
  onOpenStore,
  onArchiveCompleted,
  onWipe,
}: Props) {
  const [displayName, setDisplayName] = useState(name);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [notifOn, setNotifOn] = useState(true);
  const [chimesOn, setChimesOn] = useState(!isMuted());
  const [quiet, setQuiet] = useState<QuietHours>(DEFAULT_QUIET);

  useEffect(() => {
    if (!open) return;
    setDisplayName(name);
    setPermission(typeof Notification !== "undefined" ? Notification.permission : "denied");
    setNotifOn(notificationsEnabled());
    setChimesOn(!isMuted());
    setQuiet(loadQuietHours());
  }, [open, name]);

  if (!open) return null;

  const linked = partners.length > 0 || pods > 0;

  const toggleNotifications = async (next: boolean) => {
    if (!next) {
      setNotificationsEnabled(false);
      setNotifOn(false);
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      setNotificationsEnabled(true);
      setNotifOn(true);
      await subscribeToPush();
    } else {
      setNotifOn(false);
    }
  };

  const toggleChimes = (next: boolean) => {
    setMuted(!next);
    setChimesOn(next);
    if (next) playCompleteChime();
  };

  const updateQuiet = (patch: Partial<QuietHours>) => {
    const next = { ...quiet, ...patch };
    setQuiet(next);
    saveQuietHours(next);
  };

  return (
    <div className="vx-overlay fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm sm:items-center sm:p-4">
      <div className="vx-sheet max-h-[90vh] w-full max-w-lg overflow-hidden rounded-t-3xl border sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <IconSettings width={17} height={17} className="text-indigo-600" />
            Settings
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <IconX width={18} height={18} />
          </button>
        </div>

        <div className="max-h-[74vh] space-y-5 overflow-y-auto px-5 py-4 text-[13px] text-slate-600">
          {/* ── Account ─────────────────────────────────────────── */}
          <section className="vx-card rounded-2xl border p-4">
            <div className="flex items-center gap-3">
              <span className="vx-gradient grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-bold text-white">
                {(displayName.trim()[0] ?? "V").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={() => onName(displayName)}
                  placeholder="Your name"
                  className="w-full bg-transparent text-[15px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-indigo-700">
                    Vervox Free — All Features Unlocked
                  </span>
                  <span
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      linked ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <IconCheck width={10} height={10} />
                    {linked ? "Device Paired" : "Offline Ready"}
                  </span>
                  {mode === "firebase" && (
                    <span className="flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      <IconCloud width={10} height={10} /> Cloud sync
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-3 border-t border-slate-100 pt-3 text-[12px]">
              {partners.length > 0
                ? `Connected with ${partners.length} partner${partners.length === 1 ? "" : "s"}`
                : "No partner linked"}
              {pods > 0 && ` · ${pods} group pod${pods === 1 ? "" : "s"}`}
            </p>
          </section>

          {/* ── Preferences ─────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preferences</h3>
            <Row
              label="Notifications & alarms"
              hint={
                permission === "denied"
                  ? "Blocked in browser settings"
                  : permission === "granted"
                    ? "Lock-screen alarms & partner updates"
                    : "Tap to allow notifications"
              }
              value={notifOn && permission === "granted"}
              onChange={(v) => void toggleNotifications(v)}
            />
            <Row label="Audio chimes" hint="Completion, alarm and nudge sounds" value={chimesOn} onChange={toggleChimes} />
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
              <Row
                label="Quiet hours"
                hint="Silence sounds during this window"
                value={quiet.enabled}
                onChange={(v) => updateQuiet({ enabled: v })}
              />
              {quiet.enabled && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="time"
                    value={quiet.start}
                    onChange={(e) => updateQuiet({ start: e.target.value })}
                    className="flex-1 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-indigo-400 [color-scheme:light]"
                  />
                  <span className="text-[11px] text-slate-500">to</span>
                  <input
                    type="time"
                    value={quiet.end}
                    onChange={(e) => updateQuiet({ end: e.target.value })}
                    className="flex-1 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-indigo-400 [color-scheme:light]"
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── Appearance ──────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Appearance</h3>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => {
                const active = themeId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onTheme(t.id)}
                    className={`rounded-xl border p-2.5 text-left transition hover:border-indigo-300 ${
                      active ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="flex gap-1">
                      {[t.vars["--vx-accent"], t.vars["--vx-accent-2"], t.vars["--vx-ok"]].map((c, i) => (
                        <span key={i} className="h-4 w-4 rounded-full ring-1 ring-slate-200" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="mt-1.5 block text-[12px] font-semibold text-slate-900">{t.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CHIME_PACKS.map((c) => {
                const active = chimeId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onChime(c.id);
                      playCompleteChime();
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-left text-[12px] font-semibold transition hover:border-indigo-300 ${
                      active ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Data ────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clear / Archive Tasks</h3>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-[12px] text-slate-600">
                <IconArchive width={14} height={14} className="text-slate-400" />
                {completedCount} completed · {archivedCount} archived
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  onClick={onArchiveCompleted}
                  disabled={completedCount === 0}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                >
                  Archive completed
                </button>
                <button
                  onClick={onWipe}
                  className="rounded-xl border border-rose-200 px-3 py-2 text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Clear all tasks
                </button>
              </div>
            </div>
          </section>

          <p className="pb-1 text-center text-[11px] text-slate-400">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-indigo-600 hover:underline"
            >
              Privacy Policy &amp; Terms of Service
            </a>{" "}
            · Engineered &amp; Maintained by{" "}
            <a
              href="https://fabuyodevs.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-500 hover:text-slate-700"
            >
              FabuyoDevs
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
      <div className="min-w-0 pr-3">
        <p className="truncate font-medium text-slate-900">{label}</p>
        <p className="truncate text-[11px] text-slate-500">{hint}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`grid h-6 w-11 shrink-0 place-items-center rounded-full transition ${value ? "bg-indigo-600" : "bg-slate-300"}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white transition ${value ? "translate-x-2.5" : "-translate-x-2.5"}`} />
      </button>
    </div>
  );
}
