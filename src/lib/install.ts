/* PWA bootstrap — service worker registration */
import { initInstallPrompt } from "./pwa";

export function initAppInstall() {
  initInstallPrompt();

  if ("serviceWorker" in navigator) {
    const isDev = ((import.meta as unknown as { env?: { DEV?: boolean } }).env ?? {}).DEV === true;
    if (isDev) {
      // In local dev, unregister any active worker so it does not intercept Vite HMR WebSockets
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          void reg.unregister();
        }
      });
    } else {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
          console.warn("[vervox] service worker registration failed", err);
        });
      });
      if (document.readyState === "complete") {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    }
  }
}
