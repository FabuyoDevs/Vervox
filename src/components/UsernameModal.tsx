import { useState } from "react";
import { IconCheck } from "@/components/Icons";

interface Props {
  open: boolean;
  onConfirm: (username: string) => Promise<void>;
}

export default function UsernameModal({ open, onConfirm }: Props) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const validate = (val: string): string | null => {
    const clean = val.trim().replace(/^@+/, "");
    if (clean.length < 3) return "Username must be at least 3 characters.";
    if (clean.length > 20) return "Username cannot exceed 20 characters.";
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) return "Only letters, numbers, and underscores are allowed.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(username);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const clean = username.trim().replace(/^@+/, "");
      await onConfirm(clean);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to claim username. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200/20 bg-white p-6 shadow-2xl shadow-slate-950/50 dark:bg-slate-900">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="vx-gradient mb-3 grid h-14 w-14 place-items-center rounded-2xl text-2xl font-bold text-white shadow-lg shadow-indigo-500/30">
            V
          </span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Choose Your Username
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Your unique identity for partner accountability and pod workspaces.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Unique Username
            </label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-3.5 text-base font-bold text-indigo-500">
                @
              </span>
              <input
                type="text"
                autoFocus
                disabled={loading}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="alex_dev"
                maxLength={20}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-8 pr-4 text-base font-semibold text-slate-900 outline-none ring-offset-2 transition focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400 dark:focus:bg-slate-900"
              />
            </div>
            {error && (
              <p className="mt-1.5 text-xs font-medium text-rose-500">{error}</p>
            )}
          </div>

          <div className="rounded-xl border border-amber-200/60 bg-amber-50/70 p-3 text-left dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-300">
              <strong className="font-semibold">Permanent Binding:</strong> Once set, this username is permanently locked to this device's hardware ID and cannot be changed or transferred.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <IconCheck width={16} height={16} strokeWidth={3} />
                <span>Claim & Lock Username</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
