import { cn } from "./cn";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Circular score gauge (0–100) with a centered value.
 * Used on the coaching report hero.
 */
export function ScoreRing({
  score = 0,
  size = 140,
  stroke = 12,
  label = "Score",
  className,
}: {
  score?: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clamp(score, 0, 100);
  const dash = (pct / 100) * c;

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          <linearGradient id="scoreRingGrad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#scoreRingGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700 drop-shadow-[0_0_16px_rgba(34,197,94,0.35)]"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-bold leading-none">{pct}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
        </div>
      </div>
    </div>
  );
}
