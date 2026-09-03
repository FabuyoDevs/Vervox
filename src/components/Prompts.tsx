import { useEffect, useState } from "react";
import { IconBell, IconCheck, IconX } from "@/components/Icons";
import { fireLocalNotification, notificationsEnabled, requestNotificationPermission, subscribeToPush } from "@/lib/pwa";

interface Props {
  onNotify: (message: string, tone?: "info" | "success" | "danger") => void;
}

const KEY_NOTIF = "vervox:prompt-notif-dismissed";

/**
 * In-app permission prompt for native notifications.
 * The install banner lives in App.tsx and is driven by the vanilla PWA
 * bootstrap in src/lib/install.ts (beforeinstallprompt + iOS fallback).
 */
export default function Prompts({ onNotify }: Props) {
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [hideNotif, setHideNotif] = useState(() => localStorage.getItem(KEY_NOTIF) === "1");

  useEffect(() => {
    setPerm(typeof Notification !== "undefined" ? Notification.permission : "denied");
  }, []);

  const visible = perm !== "granted" && !hideNotif;
  if (!visible) return null;

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") {
      await subscribeToPush();
      onNotify("Reminders on — alarms and partner updates will reach your lock screen.", "success");
      await fireLocalNotification(
        "Vervox notifications on",
        "Alarms, partner completions and nudges will show here.",
        "vervox-welcome"
      );
    } else {
      onNotify("Notification permission blocked. Re-enable it in your browser site settings.", "danger");
    }
  };

  return (
    <div
      className={`relative rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm ${
        notificationsEnabled() ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={() => {
          localStorage.setItem(KEY_NOTIF, "1");
          setHideNotif(true);
        }}
        className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss notification prompt"
      >
        <IconX width={14} height={14} />
      </button>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
          <IconBell width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-900">Enable reminders</p>
          <p className="text-[11px] text-slate-500">
            {perm === "denied"
              ? "Notifications are blocked in your browser settings."
              : "Alarms, partner completions and nudges on your lock screen."}
          </p>
        </div>
        <button
          onClick={() => void enable()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <IconCheck width={13} height={13} /> Enable
        </button>
      </div>
    </div>
  );
}
