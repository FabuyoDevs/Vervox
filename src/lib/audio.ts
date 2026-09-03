/* Web Audio API chimes — synthesised, so Vervox ships zero audio assets. */

let ctx: AudioContext | null = null;
let muted = false;
let pack = { tones: [880, 1174.66, 1567.98], type: "triangle" as OscillatorType };

/** Swapped by the Themes & Sounds pack. */
export const setChimePack = (p: { tones: number[]; type: OscillatorType }) => {
  pack = p;
};

const context = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

export const setMuted = (v: boolean) => {
  muted = v;
};
export const isMuted = () => muted;

export const unlockAudio = () => {
  const c = context();
  if (c && c.state === "suspended") void c.resume();
};

type Tone = { freq: number; at: number; dur: number; gain?: number; type?: OscillatorType };

const playTones = (tones: Tone[]) => {
  if (muted) return;
  const c = context();
  if (!c) return;
  const start = c.currentTime;
  for (const t of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.setValueAtTime(t.freq, start + t.at);
    const peak = t.gain ?? 0.18;
    gain.gain.setValueAtTime(0.0001, start + t.at);
    gain.gain.exponentialRampToValueAtTime(peak, start + t.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.at + t.dur);
    osc.connect(gain).connect(c.destination);
    osc.start(start + t.at);
    osc.stop(start + t.at + t.dur + 0.05);
  }
};

/** Instant reward chime when a task is confirmed complete. */
export const playCompleteChime = () =>
  playTones(
    pack.tones.map((freq, i) => ({ freq, at: i * 0.07, dur: 0.16 + i * 0.08, gain: 0.16 - i * 0.02, type: pack.type }))
  );

export const playUndoChime = () =>
  playTones([
    { freq: 660, at: 0, dur: 0.12, gain: 0.12, type: "triangle" },
    { freq: 440, at: 0.08, dur: 0.2, gain: 0.1, type: "triangle" },
  ]);

export const playDeleteChime = () =>
  playTones([
    { freq: 320, at: 0, dur: 0.14, gain: 0.12, type: "sawtooth" },
    { freq: 200, at: 0.09, dur: 0.22, gain: 0.1, type: "sawtooth" },
  ]);

/** Three-pulse alarm for scheduled reminders. */
export const playAlarm = () => {
  for (let i = 0; i < 3; i++) {
    window.setTimeout(
      () =>
        playTones([
          { freq: 1046.5, at: 0, dur: 0.18, gain: 0.2, type: "square" },
          { freq: 784, at: 0.12, dur: 0.22, gain: 0.18, type: "square" },
        ]),
      i * 420
    );
  }
};

/** Incoming nudge from a partner / pod member. */
export const playNudge = () =>
  playTones([
    { freq: 987.77, at: 0, dur: 0.12, gain: 0.14, type: "triangle" },
    { freq: 1318.51, at: 0.13, dur: 0.22, gain: 0.13, type: "triangle" },
  ]);

export const playPairChime = () =>
  playTones([
    { freq: 523.25, at: 0, dur: 0.14, gain: 0.13 },
    { freq: 659.25, at: 0.1, dur: 0.14, gain: 0.13 },
    { freq: 987.77, at: 0.2, dur: 0.3, gain: 0.12, type: "triangle" },
  ]);
