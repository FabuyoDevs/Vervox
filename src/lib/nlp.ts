/* Silent natural-language date & time parsing.
   Pure regex — no network, no model. Runs on every keystroke and returns the
   cleaned title plus the date/time it lifted out of the sentence. */

import { addDays, nowTime, todayKey } from "./utils";

export interface ParsedTask {
  title: string;
  date: string | null;
  time: string | null;
  hasAlarm: boolean;
  matched: string[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const pad = (n: number) => String(n).padStart(2, "0");

const weekdayDate = (target: number, next: boolean): string => {
  const today = new Date();
  const current = today.getDay();
  let delta = target - current;
  if (delta <= 0 || next) delta += 7;
  return addDays(todayKey(), delta);
};

const monthDate = (month: number, day: number): string => {
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year += 1;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month + 1)}-${p(day)}`;
};

interface Span {
  start: number;
  end: number;
}

const PLAIN_ENGLISH: Array<[RegExp, string]> = [
  [/\bu\b/gi, "you"],
  [/\bur\b/gi, "your"],
  [/\br\b/gi, "are"],
  [/\bpls\b|\bplz\b/gi, "please"],
  [/\basap\b/gi, "as soon as possible"],
  [/\bmsg\b/gi, "message"],
  [/\bappt\b/gi, "appointment"],
  [/\binfo\b/gi, "information"],
];

const normalizeTitle = (value: string) =>
  PLAIN_ENGLISH.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), value)
    .replace(/\s{2,}/g, " ")
    .trim();

export function parseTaskInput(raw: string): ParsedTask {
  const source = raw ?? "";
  let date: string | null = null;
  let time: string | null = null;
  const spans: Span[] = [];
  const matched: string[] = [];

  const collect = (re: RegExp, apply: (m: RegExpExecArray) => void, label: string) => {
    const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(source))) {
      apply(m);
      matched.push(label);
      spans.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) rx.lastIndex++;
    }
  };

  /* ------------------------------- time ------------------------------- */
  // "at 5pm", "at 5:30 pm", "at 17:00", "5pm", "17:00", "5:30 p.m."
  collect(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)\b/gi, (m) => {
    let hour = parseInt(m[1], 10);
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3].replace(/\s|\./g, "").toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour < 24 && minutes < 60) time = `${pad(hour)}:${pad(minutes)}`;
  }, "time");

  collect(/\b(?:at\s+)?(\d{1,2}):(\d{2})(?!\s*(?:a|p)\.?\s?m\.?)/gi, (m) => {
    const hour = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    if (hour < 24 && minutes < 60) time = `${pad(hour)}:${pad(minutes)}`;
  }, "time");

  collect(/\b(noon|midday)\b/gi, () => {
    time = "12:00";
  }, "time");

  collect(/\bmidnight\b/gi, () => {
    time = "00:00";
  }, "time");

  collect(/\b(this\s+)?(morning|afternoon|evening|tonight)\b/gi, (m) => {
    const word = m[2].toLowerCase();
    time = word === "morning" ? "09:00" : word === "afternoon" ? "14:00" : word === "evening" ? "19:00" : "20:00";
    if (word === "tonight" && !date) date = todayKey();
  }, "time");

  /* ------------------------------- date ------------------------------- */
  collect(/\b(?:today|tonite)\b/gi, () => {
    date = todayKey();
  }, "date");

  collect(/\btomorrow\b|\btmrw\b|\btmr\b/gi, () => {
    date = addDays(todayKey(), 1);
  }, "date");

  collect(/\byesterday\b/gi, () => {
    date = addDays(todayKey(), -1);
  }, "date");

  collect(/\bnext\s+week\b/gi, () => {
    date = addDays(todayKey(), 7);
  }, "date");

  collect(/\bin\s+(\d{1,2})\s+(day|days|d|week|weeks|w)\b/gi, (m) => {
    const n = parseInt(m[1], 10);
    const unit = m[2].startsWith("w") ? 7 : 1;
    date = addDays(todayKey(), n * unit);
  }, "date");

  // "next Monday", "on Monday", "Monday", "this Friday"
  const weekdayNames = Object.keys(WEEKDAYS).join("|");
  collect(new RegExp(`\\b(?:next|this|on|by|for)?\\s*(${weekdayNames})\\b`, "gi"), (m) => {
    const name = m[1].toLowerCase();
    const next = /\bnext\b/i.test(m[0]);
    date = weekdayDate(WEEKDAYS[name], next);
  }, "date");

  // "on Aug 30", "Aug 30th", "30 August", "30th of August"
  const monthNames = Object.keys(MONTHS).join("|");
  collect(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi"), (m) => {
    date = monthDate(MONTHS[m[1].toLowerCase().slice(0, 3)], parseInt(m[2], 10));
  }, "date");
  collect(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})\\.?\\b`, "gi"), (m) => {
    date = monthDate(MONTHS[m[2].toLowerCase().slice(0, 3)], parseInt(m[1], 10));
  }, "date");

  // numeric: 2026-08-30, 8/30, 30/8 (day-first when > 12)
  collect(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => {
    date = `${m[1]}-${pad(parseInt(m[2], 10))}-${pad(parseInt(m[3], 10))}`;
  }, "date");
  collect(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (m) => {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : new Date().getFullYear();
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) date = `${year}-${pad(month)}-${pad(day)}`;
  }, "date");

  /* ------------------------------ cleanup ----------------------------- */
  let title = source;
  if (spans.length) {
    // Remove longest spans first, then overlaps, so "at 5pm tomorrow" cleans fully.
    const sorted = [...spans].sort((a, b) => b.end - b.end || a.start - b.start);
    let chars = source.split("");
    for (const span of sorted) {
      for (let i = span.start; i < span.end; i++) chars[i] = "";
      // Swallow a trailing/leading connector + the space it owned.
      if (chars[span.start - 1] === " ") {
        let j = span.start - 2;
        const word = [];
        while (j >= 0 && /[a-z]/i.test(chars[j] ?? "")) {
          word.unshift(chars[j]);
          j--;
        }
        const w = word.join("").toLowerCase();
        if (["at", "on", "by", "for", "due", "this", "next", "the"].includes(w)) {
          for (let k = j + 1; k < span.start; k++) chars[k] = "";
        }
      }
    }
    title = chars.join("");
  }
  title = title
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?-])/g, "$1")
    .replace(/^[\s,.;:!?&–—-]+|[\s,;:–—-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const hasTime = matched.includes("time");
  return {
    title: normalizeTitle(title || source.trim()),
    date,
    time,
    // An explicit time is an implicit reminder.
    hasAlarm: hasTime && time !== null,
    matched,
  };
}

/** Short human summary for the composer chip. */
export function describeParsed(parsed: ParsedTask): string | null {
  if (!parsed.date && !parsed.time) return null;
  const parts: string[] = [];
  if (parsed.date) {
    const today = todayKey();
    parts.push(
      parsed.date === today
        ? "Today"
        : parsed.date === addDays(today, 1)
          ? "Tomorrow"
          : new Date(`${parsed.date}T00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    );
  }
  if (parsed.time) parts.push(parsed.time);
  return parts.join(" at ");
}

export const defaultTime = () => nowTime();
