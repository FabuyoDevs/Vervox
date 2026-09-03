import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initAppInstall } from "./lib/install";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/* app.js equivalent: registers /sw.js on load and wires the install prompt. */
initAppInstall();

/* When Vervox is deployed as a single self-contained HTML file there is no
   /manifest.json on the server — rebuild an identical manifest from a blob URL
   so installability still works. */
(async () => {
  try {
    const res = await fetch("/manifest.json", { method: "GET" });
    if (res.ok) return;
    const manifest = {
      name: "Vervox — Focus Today, Together",
      short_name: "Vervox",
      description: "Privacy-first, offline-capable task management with zero-password partner pairing.",
      start_url: location.pathname,
      scope: "/",
      display: "standalone",
      background_color: "#f8fafc",
      theme_color: "#4f46e5",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      ],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.setAttribute("href", url);
  } catch {
    /* manifest is a progressive enhancement */
  }
})();
