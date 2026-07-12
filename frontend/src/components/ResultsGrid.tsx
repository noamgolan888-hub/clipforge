import { CheckCircle2 } from "lucide-react";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ResultsGridProps {
  job: Job;
  aspect?: "9:16" | "1:1" | "16:9";
}

export function ResultsGrid({ job, aspect = "9:16" }: ResultsGridProps) {
  if (job.status !== "done" || job.clips.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-success">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-[13px] font-medium">
          {job.clips.length} clip{job.clips.length > 1 ? "s" : ""} ready
        </span>
      </div>
      <div
        className={cn(
          "grid gap-4",
          aspect === "9:16" && "grid-cols-2 sm:grid-cols-3",
          aspect === "1:1" && "grid-cols-2 sm:grid-cols-3",
          aspect === "16:9" && "grid-cols-1 sm:grid-cols-2"
        )}
      >
        {job.clips.map((clip, i) => (
          <VideoPlayer key={clip.id} clip={clip} aspect={aspect} index={i} />
        ))}
      </div>
    </div>
  );
}
