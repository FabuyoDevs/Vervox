import { useEffect, useState } from "react";
import { IconCheck, IconDownload, IconSmartphone, IconX } from "@/components/Icons";
import { usePwaInstall } from "@/lib/pwa";

const DISMISS_KEY = "vervox:install-modal-dismissed";

interface Props {
  open?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export default function InstallModal({ open, onClose, onSuccess }: Props) {
  const { canPrompt, installed, isIOS, promptInstall } = usePwaInstall();
  const [autoOpen, setAutoOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"native" | "ios">(() => (isIOS ? "ios" : "native"));
  const [installing, setInstalling] = useState(false);

  // Auto-prompt once on first visit if not dismissed and not yet installed
  useEffect(() => {
    if (installed) return;
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    if (dismissed) return;

    if (canPrompt) {
      setAutoOpen(true);
    } else {
      // Delay prompt slightly for user orientation
      const timer = setTimeout(() => {
        if (!installed && localStorage.getItem(DISMISS_KEY) !== "1") {
          setAutoOpen(true);
        }
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [canPrompt, installed]);

  // Keep tab in sync with platform
  useEffect(() => {
    setActiveTab(isIOS ? "ios" : "native");
  }, [isIOS]);

  const isOpen = open !== undefined ? open : autoOpen;

  if (!isOpen) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setAutoOpen(false);
    onClose?.();
  };

  const handleNativeInstall = async () => {
    setInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        onSuccess?.();
        handleDismiss();
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 p-5 pb-4">
          <div className="flex items-center gap-3">
            <span className="vx-gradient grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-md">
              <IconSmartphone width={22} height={22} />
            </span>
            <div>
              <h2 id="install-modal-title" className="text-[17px] font-bold text-slate-900">
                {installed ? "Vervox Installed" : "Install Vervox App"}
              </h2>
              <p className="text-[12px] text-slate-500">Fast, offline-ready &amp; runs like a native app</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="-mr-1.5 -mt-1.5 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <IconX width={18} height={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {installed ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                <IconCheck width={28} height={28} />
              </div>
              <p className="text-[15px] font-bold text-slate-900">You're all set!</p>
              <p className="mt-1 text-[12.5px] text-slate-600">
                Vervox is already installed and running on your device. You can launch it directly from your home screen or app drawer.
              </p>
            </div>
          ) : (
            <>
              {/* Platform switcher tabs */}
              <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("native")}
                  className={`flex-1 rounded-lg py-1.5 text-center text-[12px] font-semibold transition ${
                    activeTab === "native" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Android / Chrome / PC
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ios")}
                  className={`flex-1 rounded-lg py-1.5 text-center text-[12px] font-semibold transition ${
                    activeTab === "ios" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  iPhone / iPad (iOS)
                </button>
              </div>

              {activeTab === "native" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3.5">
                    <p className="text-[12.5px] font-semibold text-indigo-950">Install for the best experience:</p>
                    <ul className="mt-1.5 space-y-1 text-[12px] text-indigo-800">
                      <li className="flex items-center gap-1.5">
                        <span className="text-emerald-600 font-bold">✓</span> Fullscreen with zero browser URL bar
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="text-emerald-600 font-bold">✓</span> Fast offline loading &amp; instant alarms
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="text-emerald-600 font-bold">✓</span> 1-tap launch from your home screen
                      </li>
                    </ul>
                  </div>

                  {canPrompt ? (
                    <button
                      type="button"
                      onClick={handleNativeInstall}
                      disabled={installing}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-[14px] font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50"
                    >
                      <IconDownload width={18} height={18} />
                      {installing ? "Opening prompt…" : "Install Vervox to Device"}
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-600">
                      <p className="font-semibold text-slate-900">To install manually in Chrome / Edge:</p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                        <li>Tap the three vertical dots (<strong>⋮</strong>) in the top-right of your browser.</li>
                        <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                        <li>Confirm by tapping <strong>Install</strong>.</li>
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-[12px] text-indigo-900">
                    <p className="font-semibold">How to install on iOS Safari:</p>
                    <p className="mt-0.5 text-indigo-700">Apple requires adding to Home Screen directly from Safari:</p>
                  </div>

                  <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[12.5px] text-slate-700">
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700">
                        1
                      </div>
                      <p className="pt-0.5">
                        Tap the <strong>Share</strong> button in Safari's bottom toolbar (the square with an arrow pointing up{" "}
                        <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">⎋</span>).
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700">
                        2
                      </div>
                      <p className="pt-0.5">
                        Scroll down the menu options and tap <strong>"Add to Home Screen"</strong> (with the{" "}
                        <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 font-bold text-[11px] text-slate-800">➕</span>{" "}
                        icon).
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700">
                        3
                      </div>
                      <p className="pt-0.5">
                        Tap <strong>"Add"</strong> in the top-right corner to place Vervox on your phone.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex border-t border-slate-100 bg-slate-50/75 px-5 py-3.5">
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full rounded-xl bg-slate-200/80 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-300"
          >
            {installed ? "Close" : "Maybe Later"}
          </button>
        </div>
      </div>
    </div>
  );
}
