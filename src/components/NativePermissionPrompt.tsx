interface NativePermissionPromptProps {
  open: boolean;
  kind: "notifications" | "media";
  title?: string;
  onAllow: () => void;
  onCancel: () => void;
}

export default function NativePermissionPrompt({
  open,
  kind,
  title,
  onAllow,
  onCancel,
}: NativePermissionPromptProps) {
  if (!open) return null;

  const copy =
    kind === "notifications"
      ? {
          title: title ?? "Enable notifications",
          body: "Allow Vervox to send task reminders and nudges when your attention is needed.",
          action: "Enable",
        }
      : {
          title: title ?? "Enable device media",
          body: "Allow Vervox to capture your proof photo or voice note from the device camera and microphone.",
          action: "Allow access",
        };

  return (
    <div className="vx-overlay fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="vx-sheet w-full max-w-sm overflow-hidden rounded-[2rem] border p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3a7 7 0 0 0-7 7v3l-2 4v1h18v-1l-2-4V10a7 7 0 0 0-7-7z" />
              <path d="M10 21h4" />
            </svg>
          </span>
          <button
            onClick={onCancel}
            className="rounded-full px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close permission prompt"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">Vervox</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">{copy.title}</h3>
          </div>
          <p className="text-sm leading-6 text-slate-600">{copy.body}</p>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Not now
            </button>
            <button
              onClick={onAllow}
              className="flex-1 rounded-2xl bg-indigo-600 px-4 py-2.5 text-[12px] font-black text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              {copy.action}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
