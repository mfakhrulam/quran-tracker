interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}

/**
 * Pure-SVG progress ring. Server-renderable, no client JS.
 * The track is intentionally visible so a low percentage still reads as
 * "ring with a start" rather than "empty circle".
 */
export default function ProgressRing({ value, size = 148, stroke = 12, children }: ProgressRingProps) {
  const clamped = Math.min(Math.max(value, 0), 1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // At very low percentages a true arc is sub-pixel and reads as an empty ring.
  // Enforce a visible minimum so "just started" still looks like progress.
  const visual = clamped === 0 ? 0 : Math.max(clamped, 0.022);
  const dash = circumference * visual;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
