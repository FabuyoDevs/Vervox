/* Rich media: 15s voice notes + photo proof, with URL resolution for both
   Firebase Storage (https URLs) and the offline engine (IndexedDB blobs). */
import { getMedia } from "./idb";
import { MAX_VOICE_MS } from "./types";

const objectUrls = new Map<string, string>();

export const isLocalRef = (url: string | null | undefined): boolean => !!url && url.startsWith("idb:");

/** Turns `idb:<id>` into a usable object URL; base64 data URLs and https URLs pass straight through. */
export async function resolveMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("http:") || url.startsWith("https:") || url.startsWith("blob:")) {
    return url;
  }
  if (!isLocalRef(url)) return url;
  const id = url.slice(4);
  const cached = objectUrls.get(id);
  if (cached) return cached;
  try {
    const rec = await getMedia(id);
    if (!rec) return null;
    const objectUrl = URL.createObjectURL(rec.blob);
    objectUrls.set(id, objectUrl);
    return objectUrl;
  } catch {
    return null;
  }
}

/**
 * Compresses an image file/blob in the browser to a lightweight JPEG data URL (~40–80 KB)
 * so it can be stored directly inside Firestore task documents with zero cloud storage costs.
 */
export async function compressImageToDataUrl(
  fileOrBlob: Blob | File,
  maxDimension = 720,
  quality = 0.68
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Failed to load image for compression"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(fileOrBlob);
  });
}

/** Converts an audio blob into a base64 data URL for direct embedding in Firestore documents. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert audio blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const MAX_RECORD_MS = MAX_VOICE_MS;

export interface VoiceSession {
  stop: () => Promise<{ blob: Blob; durationMs: number } | null>;
  cancel: () => void;
  startedAt: number;
}

export async function startVoiceRecording(): Promise<VoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone unavailable");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();

  const done = new Promise<{ blob: Blob; durationMs: number }>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve({ blob: new Blob(chunks, { type: mimeType || "audio/webm" }), durationMs: Date.now() - startedAt });
    };
    recorder.onerror = () => reject(new Error("Recording failed"));
  });

  recorder.start();

  return {
    startedAt,
    stop: async () => {
      if (recorder.state !== "inactive") recorder.stop();
      const result = await done;
      return result.blob.size > 0 ? result : null;
    },
    cancel: () => {
      if (recorder.state !== "inactive") recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/** Photo proof — camera on mobile, file picker on desktop. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      document.body.removeChild(input);
      resolve(file);
    };
    input.click();
  });
}

export async function captureWithCamera(): Promise<Blob | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();
    await new Promise((r) => window.setTimeout(r, 350));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach((t) => t.stop());
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

export const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
