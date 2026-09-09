/* PWA helpers: service-worker registration, install prompt, local notifications. */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useEffect, useState } from "react";

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("[vervox] service worker registration failed", err);
    return null;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();

export function initInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((cb) => cb(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installListeners.forEach((cb) => cb(false));
  });
}

// Auto-initialize listeners immediately on module load so early events aren't missed
if (typeof window !== "undefined") {
  initInstallPrompt();
}

export const onInstallAvailable = (cb: (available: boolean) => void) => {
  installListeners.add(cb);
  cb(!!deferredPrompt);
  return () => installListeners.delete(cb);
};

export const canPromptInstall = () => !!deferredPrompt;

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unsupported"> {
  if (!deferredPrompt) return "unsupported";
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice?.outcome === "accepted") {
      deferredPrompt = null;
      installListeners.forEach((cb) => cb(false));
      return "accepted";
    }
    return choice?.outcome ?? "dismissed";
  } catch (err) {
    console.warn("[vervox] install prompt error", err);
    return "unsupported";
  }
}

export const isStandalone = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    document.referrer.includes("android-app://")
  );
};

const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);

/** iOS Safari never fires beforeinstallprompt — needs the Share-sheet flow. */
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(ua()) ||
  (/Macintosh/.test(ua()) && ((navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1);

export const isAndroid = () => /Android/i.test(ua());
export const isMobile = () => isIOS() || isAndroid() || /Mobile/i.test(ua());

export type InstallAvailability = "available" | "ios-manual" | "installed" | "unsupported";

export function installAvailability(): InstallAvailability {
  if (isStandalone()) return "installed";
  if (deferredPrompt) return "available";
  if (isIOS()) return "ios-manual";
  return "unsupported";
}

/** React hook to observe and trigger PWA installation reactively. */
export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(() => canPromptInstall());
  const [installed, setInstalled] = useState(() => isStandalone());
  const [ios, setIos] = useState(() => isIOS());

  useEffect(() => {
    const update = () => {
      setCanPrompt(canPromptInstall());
      setInstalled(isStandalone());
      setIos(isIOS());
    };
    update();
    const unsub = onInstallAvailable((avail) => {
      setCanPrompt(avail);
      setInstalled(isStandalone());
    });
    window.addEventListener("appinstalled", update);
    return () => {
      unsub();
      window.removeEventListener("appinstalled", update);
    };
  }, []);

  return { canPrompt, installed, isIOS: ios, promptInstall };
}

export function currentNotificationPermission(): NotificationPermission {
  if (Capacitor.isNativePlatform()) {
    const state = localStorage.getItem("vervox:native-notif-perm");
    if (state === "granted") return "granted";
    if (state === "denied") return "denied";
    return "default";
  }

  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

/** App-level notification switch (independent of the OS permission). */
export const notificationsEnabled = (): boolean => {
  if (Capacitor.isNativePlatform()) {
    return localStorage.getItem("vervox:notif-enabled") !== "0" && localStorage.getItem("vervox:native-notif-perm") === "granted";
  }

  return localStorage.getItem("vervox:notif-enabled") !== "0" && typeof Notification !== "undefined" && Notification.permission === "granted";
};

export const setNotificationsEnabled = (value: boolean) =>
  localStorage.setItem("vervox:notif-enabled", value ? "1" : "0");

function nativePermissionStateToBrowser(state: string | undefined): NotificationPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "default";
}

/* Local alarms: prefer the service worker (works while backgrounded), fall back
   to a page-level Notification, then to audio only. */
export async function fireLocalNotification(title: string, body: string, tag: string) {
  if (Capacitor.isNativePlatform()) {
    if (localStorage.getItem("vervox:native-notif-perm") !== "granted") return;
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() + Math.round(Math.random() * 1000),
            title,
            body,
            extra: { tag },
            schedule: { at: new Date(Date.now() + 500) },
          },
        ],
      });
    } catch {
      /* native notification scheduling is optional */
    }
    return;
  }

  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      reg.active?.postMessage({ type: "VERVOX_NOTIFY", title, body, tag });
      return;
    }
  }
  try {
    new Notification(title, { body, tag, icon: "/icon.svg" });
  } catch {
    /* ignore */
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      const per = nativePermissionStateToBrowser(result?.notifications ?? undefined);
      localStorage.setItem("vervox:native-notif-perm", per === "granted" ? "granted" : per === "denied" ? "denied" : "prompt");
      return per;
    } catch {
      localStorage.setItem("vervox:native-notif-perm", "denied");
      return "denied";
    }
  }

  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Web Push subscription (needs VITE_VAPID_PUBLIC_KEY). */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (Capacitor.isNativePlatform()) return null;
  const vapid = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {})
    .VITE_VAPID_PUBLIC_KEY;
  if (!vapid || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
    }
    return sub;
  } catch (err) {
    console.warn("[vervox] push subscription failed", err);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
