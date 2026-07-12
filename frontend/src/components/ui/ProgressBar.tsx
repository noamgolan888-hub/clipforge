import { cn } from "@/lib/utils";

interface ProgressBarProps {
  progress: number;
  className?: string;
}

export function ProgressBar({ progress, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-bg-elevated", className)}>
      <div
        className="relative h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      >
        <div className="absolute inset-0 animate-pulse bg-white/20" />
      </div>
    </div>
  );
}
