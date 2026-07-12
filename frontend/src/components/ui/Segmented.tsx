import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4"
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all duration-150",
              active
                ? "border-accent/50 bg-accent-soft text-text-primary shadow-[0_0_0_1px_rgba(124,92,255,0.3)_inset]"
                : "border-border bg-bg-elevated text-text-secondary hover:border-text-tertiary/40 hover:text-text-primary"
            )}
          >
            {opt.icon && (
              <span className={cn(active ? "text-accent" : "text-text-tertiary")}>{opt.icon}</span>
            )}
            <span className="text-[13px] font-medium">{opt.label}</span>
            {opt.description && (
              <span className="text-[11px] text-text-tertiary">{opt.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
