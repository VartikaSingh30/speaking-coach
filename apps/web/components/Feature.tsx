import { cn } from "./cn";

/**
 * Compact feature/value tile: icon, title, description.
 * Used in "How it works" and "What Echo tracks" sections.
 */
export function Feature({
  icon,
  title,
  desc,
  step,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  desc: string;
  step?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-neutral-900 bg-neutral-950 p-5 transition hover:bg-neutral-950/70",
        className
      )}
    >
      {typeof step === "number" && (
        <span className="absolute right-4 top-4 text-xs font-semibold text-neutral-700">
          {String(step).padStart(2, "0")}
        </span>
      )}
      {icon && (
        <div className="grid size-9 place-items-center rounded-xl border border-neutral-800 bg-neutral-900 text-emerald-400">
          {icon}
        </div>
      )}
      <h3 className="mt-3 text-sm font-semibold text-neutral-100">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{desc}</p>
    </div>
  );
}
