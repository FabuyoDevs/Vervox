import type { ReactNode } from "react";
import { IconCheck, IconCloud, IconDownload, IconLink, IconSettings, IconSmartphone, IconX } from "@/components/Icons";
import { usePwaInstall } from "@/lib/pwa";
import type { AppView, BackendMode, ViewType } from "@/lib/types";

export interface NavItem {
  key: AppView;
  label: string;
  hint: string;
  icon: ReactNode;
  count: number;
  /** Where a dropped task should land — the homepage keeps its current view. */
  dropView: ViewType | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  views: NavItem[];
  active: AppView;
  onChange: (view: AppView) => void;
  onDropTask: (view: ViewType) => void;
  mode: BackendMode;
  paired: boolean;
  partnerName?: string | null;
  onOpenPair: () => void;
  onOpenSettings: () => void;
  onOpenInstall: () => void;
}

export default function NavDrawer({
  open,
  onClose,
  views,
  active,
  onChange,
  onDropTask,
  mode,
  paired,
  partnerName,
  onOpenPair,
  onOpenSettings,
  onOpenInstall,
}: Props) {
  const { canPrompt, installed, promptInstall } = usePwaInstall();

  const select = (view: AppView) => {
    onChange(view);
    onClose();
  };

  const handleInstallClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        onClose();
        return;
      }
    }
    onOpenInstall();
    onClose();
  };

  const content = (
    <div className="flex h-full flex-col gap-1 p-3">
      {views.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => select(item.key)}
            onDragOver={(e) => {
              if (!item.dropView) return;
              e.preventDefault();
              e.currentTarget.classList.add("bg-indigo-100", "ring-2", "ring-indigo-300");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("bg-indigo-100", "ring-2", "ring-indigo-300");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("bg-indigo-100", "ring-2", "ring-indigo-300");
              if (item.dropView) onDropTask(item.dropView);
            }}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ring-1 transition ${
              isActive
                ? "bg-indigo-50 text-indigo-600 ring-indigo-200"
                : "text-slate-700 ring-transparent hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                isActive ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
              }`}
            >
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{item.label}</span>
              <span className="block truncate text-[11px] text-slate-500">{item.hint}</span>
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                isActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {item.count}
            </span>
          </button>
        );
      })}

      <div className="mt-auto space-y-2 pt-4">
        {/* PWA Install Button */}
        {!installed ? (
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <IconSmartphone width={15} height={15} />
              Install Vervox App
            </span>
            <span className="flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              <IconDownload width={10} height={10} />
              Get
            </span>
          </button>
        ) : (
          <div className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <IconCheck width={14} height={14} className="text-emerald-600" />
            <span>App Installed on Device</span>
          </div>
        )}

        <button
          onClick={() => {
            onOpenPair();
            onClose();
          }}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold ring-1 transition ${
            paired
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
              : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100"
          }`}
        >
          <IconLink width={15} height={15} />
          {paired ? (partnerName ? `Partner: @${partnerName}` : "Partner linked") : "Link a partner"}
        </button>
        <button
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
        >
          <IconSettings width={15} height={15} />
          Settings
        </button>
        <p className="flex items-center justify-center gap-1.5 pb-1 text-[10px] text-slate-400">
          <IconCloud width={11} height={11} />
          {mode === "firebase" ? "Firestore live sync" : "Offline engine · IndexedDB"}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Persistent rail on desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 px-5 pb-1 pt-6">
            <span className="vx-gradient grid h-8 w-8 place-items-center rounded-xl font-bold text-white">V</span>
            <div>
              <p className="text-[15px] font-bold leading-none text-slate-900">
                Ver<span className="vx-text-gradient">vox</span>
              </p>
              <p className="text-[10px] text-slate-500">focus, together</p>
            </div>
          </div>
          {content}
        </div>
      </aside>

      {/* Hamburger drawer on mobile / tablet */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="vx-overlay absolute inset-0 backdrop-blur-sm" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 flex w-[80%] max-w-xs flex-col border-r border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 pb-1 pt-6">
              <div className="flex items-center gap-2">
                <span className="vx-gradient grid h-8 w-8 place-items-center rounded-xl font-bold text-white">V</span>
                <p className="text-[15px] font-bold text-slate-900">
                  Ver<span className="vx-text-gradient">vox</span>
                </p>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <IconX width={18} height={18} />
              </button>
            </div>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
