import { cn } from "./cn";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

type Accent = "emerald" | "sky" | "violet" | "amber";

const BARS: Record<Accent, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
};

/**
 * Labeled metric tile with a value and a progress bar (0–100).
 * Used on the report metric grid and elsewhere.
 */
export function MetricCard({
  label,
  value,
  helper,
  barValue,
  accent = "emerald",
  icon,
  className,
}: {
  label: string;
  value?: number | string;
  helper?: string;
  barValue?: number;
  accent?: Accent;
  icon?: React.ReactNode;
  className?: string;
}) {
  const v = barValue ?? (typeof value === "number" ? value : 0);
  const pct = clamp(Math.round(v), 0, 100);
  return (
    <div className={cn("rounded-2xl border border-neutral-800 bg-neutral-900 p-4", className)}>
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-xs text-neutral-400">{label}</div>
      </div>
      <div className="mt-0.5 text-3xl font-bold tracking-tight">
        {typeof value === "number" ? Math.round(value) : value ?? pct}
      </div>
      {helper && <div className="mt-1 text-[11px] text-neutral-500">{helper}</div>}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={cn("h-full transition-[width] duration-700 ease-out", BARS[accent])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
