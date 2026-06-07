import { cn } from "./cn";

/**
 * Frosted surface card with an optional title row.
 * The canonical container used for panels and report sections.
 */
export function SectionCard({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 backdrop-blur",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      {(title || right) && (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-medium text-neutral-200">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={cn(title || right ? "mt-3" : "")}>{children}</div>
    </section>
  );
}
