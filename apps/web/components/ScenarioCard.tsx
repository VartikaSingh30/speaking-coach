import { cn } from "./cn";

/**
 * Selectable scenario tile (radio-style) for the home scenario picker.
 * Controlled via `selected` + `onSelect`.
 */
export function ScenarioCard({
  id,
  label,
  blurb,
  icon,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  blurb: string;
  icon?: React.ReactNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <label
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-xl border p-3 transition",
        selected
          ? "border-emerald-600 bg-neutral-950 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.20)]"
          : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          selected ? "bg-emerald-500" : "bg-transparent"
        )}
      />
      <input
        type="radio"
        name="scenario"
        value={id}
        checked={selected}
        onChange={() => onSelect(id)}
        className="peer sr-only"
        aria-label={label}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {icon && <span className="mt-0.5 text-emerald-400">{icon}</span>}
          <div>
            <div className="text-sm font-medium text-neutral-100">{label}</div>
            <div className="mt-0.5 text-xs text-neutral-400">{blurb}</div>
          </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "grid h-5 w-5 place-items-center rounded-full border transition",
            selected ? "border-emerald-500 bg-emerald-500/20" : "border-neutral-700"
          )}
        >
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full transition",
              selected ? "bg-emerald-400" : "bg-transparent"
            )}
          />
        </div>
      </div>
    </label>
  );
}
