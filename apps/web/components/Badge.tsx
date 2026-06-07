import { cn } from "./cn";

type Tone = "good" | "bad" | "warn" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  good: "bg-emerald-600/15 border-emerald-700 text-emerald-200",
  bad: "bg-red-600/15 border-red-700 text-red-200",
  warn: "bg-amber-600/15 border-amber-700 text-amber-100",
  info: "bg-sky-600/15 border-sky-700 text-sky-200",
  neutral: "bg-neutral-900 border-neutral-700 text-neutral-300",
};

/** Compact status pill used across the app for state + labels. */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] leading-none",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Animated dot, useful inside a Badge to signal "live". */
export function LiveDot({ tone = "good" }: { tone?: "good" | "warn" | "bad" }) {
  const color =
    tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-red-400";
  return <span className={cn("h-1.5 w-1.5 rounded-full", color, "animate-pulse")} />;
}
