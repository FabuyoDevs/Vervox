import { useState } from "react";
import { IconBell, IconCalendar, IconCheck, IconLink } from "@/components/Icons";

interface Props {
  open: boolean;
  onDismiss: () => void;
}

const SLIDES = [
  {
    icon: <IconCalendar width={22} height={22} />,
    title: "Focus on today, plan for later",
    body: "Vervox splits your list into Today and Scheduled. Type “buy milk tomorrow at 5pm” and the date is parsed automatically.",
  },
  {
    icon: <IconCheck width={22} height={22} />,
    title: "One-tap completion",
    body: "Tap the circle — or swipe a task right on mobile — to mark it done. Swipe left to defer it a day.",
  },
  {
    icon: <IconLink width={22} height={22} />,
    title: "Pair or start a pod",
    body: "Share a single-use invite code to sync tasks with a partner or a group of up to 6 people. No account, no password.",
  },
];

export default function Onboarding({ open, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  if (!open) return null;
  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-900/25 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="px-6 pb-4 pt-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-white shadow-sm">
            {slide.icon}
          </span>
          <h2 className="mt-3 text-[17px] font-bold text-slate-900">{slide.title}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{slide.body}</p>
        </div>

        <div className="flex justify-center gap-1.5 pb-4" aria-hidden="true">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-indigo-600" : "w-1.5 bg-slate-200"}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button
            onClick={onDismiss}
            className="rounded-xl px-3 py-2 text-[12px] font-semibold text-slate-500 hover:bg-slate-200 hover:text-slate-700"
          >
            Skip
          </button>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
            >
              Back
            </button>
          )}
          <button
            onClick={() => (last ? onDismiss() : setStep((s) => s + 1))}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            {last ? "Get started" : "Next"}
            {last && <IconBell width={13} height={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}
