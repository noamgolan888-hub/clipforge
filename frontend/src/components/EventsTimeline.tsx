import { Target } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatTime } from "@/lib/utils";
import type { DetectedEvent } from "@/lib/types";

export function EventsTimeline({ events }: { events: DetectedEvent[] }) {
  if (!events.length) return null;

  return (
    <div className="rounded-2xl border border-border bg-bg-secondary/60 p-5">
      <p className="mb-4 text-[13px] font-semibold text-text-primary">Detected key moments</p>
      <div className="space-y-1">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Target className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[13px] font-medium text-text-primary">{event.label}</p>
                <p className="text-[11px] text-text-tertiary">{formatTime(event.timestamp)}</p>
              </div>
            </div>
            <Badge tone={event.confidence > 0.85 ? "success" : "neutral"}>
              {Math.round(event.confidence * 100)}% confidence
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
