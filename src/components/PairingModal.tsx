import { useEffect, useState } from "react";
import { IconCopy, IconLink, IconX } from "@/components/Icons";
import { copyText } from "@/lib/utils";
import type { PairCode } from "@/lib/types";
import { playPairChime } from "@/lib/audio";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: "firebase" | "local";
  deviceId: string;
  uid: string | null;
  partners: string[];
  partnerName?: string | null;
  pairLock: number;
  attempts: number;
  onGenerate: () => Promise<PairCode>;
  onJoin: (code: string) => Promise<unknown>;
  onUnpair: () => Promise<void>;
  onOpenSecondDevice: () => void;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function PairingModal({
  open,
  onClose,
  mode,
  deviceId,
  uid,
  partners,
  partnerName,
  pairLock,
  attempts,
  onGenerate,
  onJoin,
  onUnpair,
  onOpenSecondDevice,
}: Props) {
  const [tab, setTab] = useState<"generate" | "join">("generate");
  const [code, setCode] = useState<PairCode | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockLeft, setLockLeft] = useState(pairLock);

  useEffect(() => {
    if (!open) {
      setCode(null);
      setInput("");
      setError(null);
    }
  }, [open]);

  useEffect(() => setLockLeft(pairLock), [pairLock]);

  useEffect(() => {
    if (!code) return;
    const i = window.setInterval(() => setRemaining(code.expires_at - Date.now()), 500);
    return () => window.clearInterval(i);
  }, [code]);

  useEffect(() => {
    if (lockLeft <= 0) return;
    const i = window.setInterval(() => setLockLeft((v) => Math.max(0, v - 1000)), 1000);
    return () => window.clearInterval(i);
  }, [lockLeft]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await onGenerate();
      setCode(next);
      setRemaining(next.expires_at - Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a code.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!input.trim() || lockLeft > 0) return;
    setBusy(true);
    setError(null);
    try {
      await onJoin(input);
      playPairChime();
      setInput("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
      if (err instanceof Error && err.message.includes("locked")) setLockLeft(5 * 60 * 1000);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const paired = partners.length > 0;

  return (
    <div className="vx-overlay fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="vx-sheet w-full max-w-md rounded-t-3xl border p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-50">
              <IconLink width={18} height={18} className="text-violet-300" />
              Link a partner
            </h2>
            <p className="mt-1 text-[12px] text-slate-400">
              Secure device sign-in, one-time code, 5-minute expiry.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <IconX width={18} height={18} />
          </button>
        </div>

        {paired && (
          <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-500/25">
            <p className="text-[12px] font-semibold text-emerald-300">Linked ✓</p>
            <p className="mt-0.5 text-[12px] font-medium text-emerald-100">Partner: @{partnerName || "Partner"}</p>
            <button
              onClick={() => void onUnpair()}
              className="mt-2 rounded-lg bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/25"
            >
              Unlink
            </button>
          </div>
        )}

        <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Secure Identity</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200">
              <span className="block text-slate-500">Device Status</span>
              <span className="mt-0.5 block truncate font-semibold text-emerald-600">Hardware Bound ✓</span>
            </div>
            <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200">
              <span className="block text-slate-500">Engine</span>
              <span className="mt-0.5 block truncate font-semibold text-slate-900">
                {mode === "firebase" ? "Cloud Firestore" : "Local Offline"}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Vervox uses a private cryptographic hardware binding instead of a public password. Only devices with a valid single-use code can link.
          </p>
        </div>

        <div className="mt-4 flex gap-1 rounded-xl bg-slate-800 p-1">
          <button
            onClick={() => setTab("generate")}
            className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition ${
              tab === "generate" ? "bg-violet-500/25 text-violet-100" : "text-slate-400"
            }`}
          >
            Link partner
          </button>
          <button
            onClick={() => setTab("join")}
            className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition ${
              tab === "join" ? "bg-violet-500/25 text-violet-100" : "text-slate-400"
            }`}
          >
            Join partner
          </button>
        </div>

        {tab === "generate" ? (
          <div className="mt-4 space-y-3">
            {!code ? (
              <button
                onClick={() => void generate()}
                disabled={busy}
                className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
              >
                {busy ? "Generating…" : "Generate pairing code"}
              </button>
            ) : (
              <div className="rounded-xl border border-violet-400/30 bg-slate-950/60 p-4 text-center">
                <p className="font-mono text-2xl font-bold tracking-[0.2em] text-violet-200">{code.code}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Expires in <span className="font-semibold text-amber-300">{fmt(remaining)}</span>
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={async () => {
                      await copyText(code.code);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-[12px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    <IconCopy width={14} height={14} /> Copy
                  </button>
                  <button
                    onClick={() => void generate()}
                    className="flex-1 rounded-lg bg-slate-800 py-2 text-[12px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    New code
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={onOpenSecondDevice}
              className="w-full rounded-xl border border-white/10 py-2.5 text-[12px] font-semibold text-slate-300 hover:bg-slate-800"
            >
              Open a second simulated device
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void join();
              }}
              placeholder="TASK-XXXX"
              maxLength={9}
              disabled={lockLeft > 0}
              className="w-full rounded-xl bg-slate-950/60 px-4 py-3 text-center font-mono text-lg tracking-[0.25em] text-slate-100 outline-none ring-1 ring-white/10 placeholder:tracking-normal placeholder:text-slate-600 focus:ring-violet-400/60 disabled:opacity-40"
            />
            <button
              onClick={() => void join()}
              disabled={busy || lockLeft > 0 || !input.trim()}
              className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40"
            >
              {lockLeft > 0 ? `Locked — ${fmt(lockLeft)}` : busy ? "Verifying…" : "Join partner"}
            </button>
            <p className="text-center text-[11px] text-slate-500">
              {lockLeft > 0
                ? "Too many incorrect attempts. Wait out the lockout."
                : `${Math.max(0, 3 - attempts)} attempts remaining before a 5-minute lockout.`}
            </p>
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>}

        <p className="mt-4 text-center text-[10px] text-slate-500">
          Silent Hardware Binding Active · Engine: {mode === "firebase" ? "Cloud Firestore" : "On-Device (Offline)"}
        </p>
      </div>
    </div>
  );
}
