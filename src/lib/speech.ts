/* Web Speech API dictation for hands-free task capture. */

interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechSupported = () => ctor() !== null;

export interface DictationHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

/** Streams dictation into `onInterim`, then commits with `onFinal`. */
export function startDictation(handlers: DictationHandlers): (() => void) | null {
  const Ctor = ctor();
  if (!Ctor) {
    handlers.onError?.("unsupported");
    return null;
  }
  const rec = new Ctor();
  rec.lang = navigator.language || "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  let finalText = "";
  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    handlers.onInterim?.((finalText + interim).trim());
    if (finalText.trim()) handlers.onFinal(finalText.trim());
  };
  rec.onerror = (event) => handlers.onError?.(event.error);
  rec.onend = () => handlers.onEnd?.();
  try {
    rec.start();
  } catch (err) {
    handlers.onError?.(String(err));
    return null;
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  };
}
