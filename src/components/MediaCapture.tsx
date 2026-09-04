import { useEffect, useRef, useState } from "react";
import { IconBell, IconMic, IconTrash, IconX } from "@/components/Icons";
import { captureWithCamera, formatDuration, MAX_RECORD_MS, pickImage, resolveMediaUrl, startVoiceRecording, type VoiceSession } from "@/lib/media";
import type { Task } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  hasAccess?: boolean;
  onAttach: (patch: { image?: File | Blob | null; voice?: Blob | null; durationMs?: number | null }) => Promise<unknown>;
  onClear: (kind: "image" | "voice") => Promise<void>;
  onUpgrade?: () => void;
}

export default function MediaCapture({ open, onClose, task, onAttach, onClear }: Props) {
  const [image, setImage] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [existingVoice, setExistingVoice] = useState<string | null>(null);
  const session = useRef<VoiceSession | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !task) return;
    setImage(null);
    setVoice(null);
    setDuration(null);
    setError(null);
    setElapsed(0);
    let cancelled = false;
    void resolveMediaUrl(task.media?.proof_image_url).then((u) => !cancelled && setExistingImage(u));
    void resolveMediaUrl(task.media?.voice_note_url).then((u) => !cancelled && setExistingVoice(u));
    return () => {
      cancelled = true;
    };
  }, [open, task]);

  useEffect(() => {
    return () => {
      session.current?.cancel();
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  if (!open || !task) return null;

  const takePhoto = async () => {
    setError(null);
    const fromCamera = await captureWithCamera();
    const file = fromCamera ?? (await pickImage());
    if (!file) return;
    setImage(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const toggleRecording = async () => {
    setError(null);
    if (recording) {
      stopRecording();
      return;
    }
    try {
      session.current = await startVoiceRecording();
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => {
        setElapsed((ms) => {
          if (ms + 100 >= MAX_RECORD_MS) {
            stopRecording();
            return MAX_RECORD_MS;
          }
          return ms + 100;
        });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone unavailable.");
    }
  };

  const stopRecording = async () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
    const result = await session.current?.stop();
    session.current = null;
    if (result) {
      setVoice(result.blob);
      setVoiceUrl(URL.createObjectURL(result.blob));
      setDuration(Math.min(result.durationMs, MAX_RECORD_MS));
    }
  };

  const submit = async () => {
    if (!image && !voice) return;
    setBusy(true);
    try {
      await onAttach({ image, voice, durationMs: duration });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const pct = Math.min(100, (elapsed / MAX_RECORD_MS) * 100);

  return (
    <div className="vx-overlay fixed inset-0 z-[55] flex items-end justify-center backdrop-blur-sm sm:items-center sm:p-4">
      <div className="vx-sheet max-h-[92vh] w-full max-w-md overflow-hidden rounded-t-3xl border sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-white/5 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100">Task proof</h2>
            <p className="truncate text-[11px] text-slate-400">{task.title}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <IconX width={18} height={18} />
          </button>
        </div>

        <div className="max-h-[62vh] space-y-3 overflow-y-auto px-4 py-4">
            {/* Photo */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Photo proof</p>
              {(imageUrl || existingImage) && (
                <img
                  src={imageUrl ?? existingImage ?? ""}
                  alt="Task proof"
                  className="mb-2 max-h-48 w-full rounded-xl object-cover"
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => void takePhoto()}
                  className="flex-1 rounded-xl bg-slate-800 py-2 text-[12px] font-semibold text-slate-200 hover:bg-slate-700"
                >
                  {imageUrl ? "Retake" : "Take photo"}
                </button>
                {existingImage && !imageUrl && (
                  <button
                    onClick={() => void onClear("image").then(onClose)}
                    className="rounded-xl bg-rose-500/15 px-3 py-2 text-slate-300"
                    aria-label="Remove photo"
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Voice */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Voice note · max {MAX_RECORD_MS / 1000}s
              </p>
              {recording && (
                <div className="mb-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-center text-[11px] font-semibold text-rose-300">
                    Recording… {(elapsed / 1000).toFixed(1)}s
                  </p>
                </div>
              )}
              {(voiceUrl || existingVoice) && !recording && (
                <div className="mb-2 flex items-center gap-2">
                  <audio src={voiceUrl ?? existingVoice ?? ""} controls className="h-8 flex-1" />
                  {existingVoice && !voiceUrl && (
                    <button
                      onClick={() => void onClear("voice").then(onClose)}
                      className="rounded-lg bg-rose-500/15 p-2 text-slate-300"
                      aria-label="Remove voice note"
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  )}
                </div>
              )}
              {voiceUrl && duration && !recording && (
                <p className="mb-2 text-[11px] text-slate-500">New note · {formatDuration(duration)}</p>
              )}
              <button
                onClick={() => void toggleRecording()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold transition ${
                  recording ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
              >
                {recording ? "Stop recording" : "Record voice note"}
                <IconMic width={14} height={14} />
              </button>
            </div>

            {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">{error}</p>}
          </div>

        <div className="flex gap-2 border-t border-white/5 px-4 py-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-slate-800 py-2.5 text-[12px] font-semibold text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || (!image && !voice)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-500 py-2.5 text-[12px] font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40"
          >
            <IconBell width={14} height={14} />
            {busy ? "Uploading…" : "Save proof"}
          </button>
        </div>
      </div>
    </div>
  );
}
