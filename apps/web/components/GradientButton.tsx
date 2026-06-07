import { cn } from "./cn";

type Variant = "primary" | "violet" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "border border-emerald-500/60 bg-emerald-500 text-black hover:brightness-95 shadow-[0_10px_30px_rgba(16,185,129,0.25)]",
  violet:
    "border border-violet-500/50 bg-violet-500 text-black hover:brightness-95 shadow-[0_10px_30px_rgba(139,92,246,0.25)]",
  ghost:
    "border border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800",
};

/**
 * Primary call-to-action button with consistent gradients/glow.
 * Renders an <a> when `href` is provided, otherwise a <button>.
 */
export function GradientButton({
  children,
  variant = "primary",
  href,
  onClick,
  disabled,
  type = "button",
  className,
  title,
}: {
  children: React.ReactNode;
  variant?: Variant;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const base = cn(
    "group inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition",
    "disabled:opacity-60 disabled:pointer-events-none",
    VARIANTS[variant],
    className
  );

  if (href) {
    return (
      <a href={href} className={base} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base} title={title}>
      {children}
    </button>
  );
}
