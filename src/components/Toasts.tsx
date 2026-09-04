import type { Toast } from "@/hooks/useVervox";

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export default function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-md flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`vx-toast pointer-events-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 shadow-lg shadow-slate-900/10 backdrop-blur-md ${
            t.tone === "success"
              ? "bg-emerald-600 text-white"
              : t.tone === "danger"
                ? "bg-rose-600 text-white"
                : "bg-slate-900 text-white"
          }`}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action?.run();
                onDismiss(t.id);
              }}
              className="rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide hover:bg-white/30"
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => onDismiss(t.id)} className="text-white/60 hover:text-white" aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
