import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0 – 100 */
  value: number;
  label: string;
  caption?: string;
  size?: number;
  className?: string;
}

/** Animated SVG progress ring built on design tokens. */
export function ProgressRing({
  value,
  label,
  caption,
  size = 148,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={`${label}: ${clamped} percent`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-secondary"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="stroke-accent transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="font-display text-3xl font-semibold">{clamped}%</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}
