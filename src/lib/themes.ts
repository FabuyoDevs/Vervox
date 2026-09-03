/* Theme + chime pack engine (extra appearances unlock with the $1.99 pack). */

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  vars: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: "daylight",
    name: "Daylight",
    blurb: "Crisp white with indigo accents.",
    vars: {
      "--vx-bg": "#f8fafc",
      "--vx-bg-alt": "#ffffff",
      "--vx-surface": "#ffffff",
      "--vx-card": "#ffffff",
      "--vx-border": "#e2e8f0",
      "--vx-accent": "#4f46e5",
      "--vx-accent-2": "#10b981",
      "--vx-glow": "rgba(79,70,229,0.07)",
      "--vx-glow-2": "rgba(16,185,129,0.06)",
      "--vx-ok": "#10b981",
    },
  },
  {
    id: "sky",
    name: "Sky",
    blurb: "Cool blue canvas, indigo highlights.",
    vars: {
      "--vx-bg": "#f0f9ff",
      "--vx-bg-alt": "#ffffff",
      "--vx-surface": "#ffffff",
      "--vx-card": "#ffffff",
      "--vx-border": "#dbeafe",
      "--vx-accent": "#0284c7",
      "--vx-accent-2": "#4f46e5",
      "--vx-glow": "rgba(2,132,199,0.08)",
      "--vx-glow-2": "rgba(79,70,229,0.06)",
      "--vx-ok": "#059669",
    },
  },
  {
    id: "citrus",
    name: "Citrus",
    blurb: "Warm parchment with amber energy.",
    vars: {
      "--vx-bg": "#fffbf0",
      "--vx-bg-alt": "#ffffff",
      "--vx-surface": "#ffffff",
      "--vx-card": "#ffffff",
      "--vx-border": "#fde68a",
      "--vx-accent": "#d97706",
      "--vx-accent-2": "#059669",
      "--vx-glow": "rgba(217,119,6,0.08)",
      "--vx-glow-2": "rgba(5,150,105,0.06)",
      "--vx-ok": "#16a34a",
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    blurb: "Neutral grey, maximum focus.",
    vars: {
      "--vx-bg": "#f4f4f5",
      "--vx-bg-alt": "#ffffff",
      "--vx-surface": "#ffffff",
      "--vx-card": "#ffffff",
      "--vx-border": "#e4e4e7",
      "--vx-accent": "#334155",
      "--vx-accent-2": "#0ea5e9",
      "--vx-glow": "rgba(51,65,85,0.06)",
      "--vx-glow-2": "rgba(14,165,233,0.05)",
      "--vx-ok": "#16a34a",
    },
  },
];

export interface ChimePack {
  id: string;
  name: string;
  tones: number[];
  type: OscillatorType;
}

export const CHIME_PACKS: ChimePack[] = [
  { id: "classic", name: "Classic", tones: [880, 1174.66, 1567.98], type: "triangle" },
  { id: "bell", name: "Bell", tones: [659.25, 987.77, 1318.51], type: "sine" },
  { id: "marimba", name: "Marimba", tones: [392, 523.25, 783.99], type: "square" },
  { id: "retro", name: "Retro", tones: [523.25, 698.46, 1046.5], type: "sawtooth" },
];

const LS_THEME = "vervox:theme";
const LS_CHIME = "vervox:chime";

export const FREE_THEME = "daylight";
export const FREE_CHIME = "classic";

export const storedTheme = () => localStorage.getItem(LS_THEME) ?? FREE_THEME;
export const storedChime = () => localStorage.getItem(LS_CHIME) ?? FREE_CHIME;

export function applyTheme(themeId: string, unlocked: boolean) {
  const id = unlocked ? themeId : FREE_THEME;
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  if (unlocked) localStorage.setItem(LS_THEME, theme.id);
  else localStorage.removeItem(LS_THEME);
}

export function setChime(id: string, unlocked: boolean) {
  const pack = CHIME_PACKS.find((p) => p.id === (unlocked ? id : FREE_CHIME)) ?? CHIME_PACKS[0];
  if (unlocked) localStorage.setItem(LS_CHIME, pack.id);
  else localStorage.removeItem(LS_CHIME);
  return pack;
}
