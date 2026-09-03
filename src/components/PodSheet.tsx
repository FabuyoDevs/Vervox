import { useEffect, useState } from "react";
import { IconCopy, IconLink, IconPlus, IconTrash, IconX } from "@/components/Icons";
import { POD_MAX_MEMBERS, POD_MIN_ACTIVE, type PairCode, type Pod } from "@/lib/types";
import { copyText } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  pods: Pod[];
  unlocked?: boolean;
  deviceId: string;
  pairLock: number;
  attempts: number;
  onCreate: (name: string, memberName: string) => Promise<{ pod: Pod; code: PairCode }>;
  onJoin: (code: string, memberName: string) => Promise<Pod>;
  onLeave: (podId: string) => Promise<void>;
  onInvite: (podId: string) => Promise<PairCode>;
  onUpgrade?: () => void;
  onOpenSecondDevice: () => void;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export default function PodSheet({
  open,
  onClose,
  pods,
  unlocked,
  deviceId,
  pairLock,
  attempts,
  onCreate,
  onJoin,
  onLeave,
  onInvite,
  onUpgrade,
  onOpenSecondDevice,
}: Props) {
  const [tab, setTab] = useState<"mine" | "create" | "join">("mine");
  const [podName, setPodName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState<PairCode | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockLeft, setLockLeft] = useState(pairLock);

  useEffect(() => {
    if (!open) {
      setInvite(null);
      setError(null);
      setCode("");
    } else {
      setTab(pods.length ? "mine" : "create");
    }
  }, [open, pods.length]);

  useEffect(() => setLockLeft(pairLock), [pairLock]);

  useEffect(() => {
    if (!invite) return;
    const i = window.setInterval(() => setRemaining(invite.expires_at - Date.now()), 500);
    return () => window.clearInterval(i);
  }, [invite]);

  useEffect(() => {
    if (lockLeft <= 0) return;
    const i = window.setInterval(() => setLockLeft((v) => Math.max(0, v - 1000)), 1000);
    return () => window.clearInterval(i);
  }, [lockLeft]);

  if (!open) return null;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await onCreate(podName, memberName || "You");
      setInvite(result.code);
      setRemaining(result.code.expires_at - Date.now());
      setPodName("");
      setTab("mine");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the pod.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim() || lockLeft > 0) return;
    setBusy(true);
    setError(null);
    try {
      await onJoin(code, memberName || "You");
      setCode("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that pod.");
      if (err instanceof Error && err.message.includes("locked")) setLockLeft(5 * 60 * 1000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vx-overlay fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm sm:items-center sm:p-4">
      <div className="vx-sheet max-h-[92vh] w-full max-w-md overflow-hidden rounded-t-3xl border sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-white/5 px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
              <IconLink width={16} height={16} className="text-violet-300" />
              Group pods
            </h2>
            <p className="text-[11px] text-slate-400">
              Shared workspaces for {POD_MIN_ACTIVE}–{POD_MAX_MEMBERS} people.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <IconX width={18} height={18} />
          </button>
        </div>


        <div className="flex gap-1 px-4 pb-2">
          {(["mine", "create", "join"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-[11.5px] font-semibold capitalize transition ${
                tab === t ? "bg-violet-500/25 text-violet-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t === "mine" ? `My pods (${pods.length})` : t}
            </button>
          ))}
        </div>

        <div className="max-h-[58vh] space-y-3 overflow-y-auto px-4 py-2">
          {tab === "mine" &&
            (pods.length === 0 ? (
              <p className="rounded-xl bg-slate-950/50 p-4 text-center text-[12px] text-slate-500">
                You haven't joined a pod yet.
              </p>
            ) : (
              pods.map((pod) => (
                <div key={pod.pod_id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-100">{pod.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {pod.members.length}/{pod.max_members} members
                        {pod.members.length < POD_MIN_ACTIVE && " · invite more to activate"}
                      </p>
                    </div>
                    <button
                      onClick={() => void onLeave(pod.pod_id)}
                      className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                      aria-label="Leave pod"
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pod.members.map((m) => (
                      <span
                        key={m.device_id}
                        title={m.device_id}
                        className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${
                          m.device_id === deviceId ? "bg-violet-500/20 text-violet-200" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-700 text-[9px]">
                          {initials(m.name)}
                        </span>
                        {m.name}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      const next = await onInvite(pod.pod_id);
                      setInvite(next);
                      setRemaining(next.expires_at - Date.now());
                    }}
                    className="mt-2.5 w-full rounded-xl bg-slate-800 py-2 text-[11.5px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    <IconPlus width={12} height={12} className="mr-1 inline" />
                    New invite code
                  </button>
                </div>
              ))
            ))}

          {tab === "create" && (
            <div className="space-y-2.5">
              <input
                value={podName}
                onChange={(e) => setPodName(e.target.value)}
                placeholder="Pod name (e.g. Apartment 4B)"
                className="w-full rounded-xl bg-slate-950/60 px-3.5 py-2.5 text-[13px] text-slate-100 outline-none ring-1 ring-white/10 placeholder:text-slate-600 focus:ring-violet-400/60"
              />
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Your display name"
                className="w-full rounded-xl bg-slate-950/60 px-3.5 py-2.5 text-[13px] text-slate-100 outline-none ring-1 ring-white/10 placeholder:text-slate-600 focus:ring-violet-400/60"
              />
              <button
                onClick={() => void create()}
                disabled={busy || !unlocked}
                className="w-full rounded-xl bg-violet-500 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-400 disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create pod & get invite"}
              </button>
            </div>
          )}

          {tab === "join" && (
            <div className="space-y-2.5">
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Your display name"
                className="w-full rounded-xl bg-slate-950/60 px-3.5 py-2.5 text-[13px] text-slate-100 outline-none ring-1 ring-white/10 placeholder:text-slate-600 focus:ring-violet-400/60"
              />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="POD-XXXX"
                maxLength={8}
                disabled={lockLeft > 0}
                className="w-full rounded-xl bg-slate-950/60 px-3.5 py-3 text-center font-mono text-lg tracking-[0.25em] text-slate-100 outline-none ring-1 ring-white/10 placeholder:tracking-normal placeholder:text-slate-600 focus:ring-violet-400/60 disabled:opacity-40"
              />
              <button
                onClick={() => void join()}
                disabled={busy || lockLeft > 0 || !code.trim() || !unlocked}
                className="w-full rounded-xl bg-violet-500 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-400 disabled:opacity-40"
              >
                {lockLeft > 0 ? `Locked — ${fmt(lockLeft)}` : busy ? "Joining…" : "Join pod"}
              </button>
              <p className="text-center text-[11px] text-slate-500">
                {lockLeft > 0 ? "Too many incorrect attempts." : `${Math.max(0, 3 - attempts)} attempts before a 5-minute lockout.`}
              </p>
            </div>
          )}

          {invite && (
            <div className="rounded-2xl border border-violet-400/30 bg-slate-950/60 p-4 text-center">
              <p className="font-mono text-2xl font-bold tracking-[0.2em] text-violet-200">{invite.code}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Expires in <span className="font-semibold text-amber-300">{fmt(remaining)}</span> · single use
              </p>
              <button
                onClick={() => void copyText(invite.code)}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2 text-[12px] font-semibold text-slate-200 hover:bg-slate-700"
              >
                <IconCopy width={14} height={14} /> Copy invite
              </button>
            </div>
          )}

          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <button onClick={onOpenSecondDevice} className="text-[11px] font-semibold text-slate-400 hover:text-slate-200">
            Open a simulated device
          </button>
          <p className="truncate text-[10px] text-slate-600">{deviceId.slice(0, 8)}</p>
        </div>
      </div>
    </div>
  );
}
