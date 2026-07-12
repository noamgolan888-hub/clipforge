import { AlertCircle, Sparkles } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

interface JobProgressProps {
  job: Job | null;
  error: string | null;
  skeletonCount?: number;
  skeletonAspect?: "9:16" | "1:1" | "16:9";
}

export function JobProgress({ job, error, skeletonCount = 3, skeletonAspect = "9:16" }: JobProgressProps) {
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3.5 text-danger">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!job) return null;

  if (job.status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3.5 text-danger">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm">{job.error || job.message}</p>
      </div>
    );
  }

  if (job.status === "done") return null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-bg-secondary/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[13px] font-medium text-text-primary">{job.message}</span>
          </div>
          <span className="text-[13px] tabular-nums text-text-tertiary">{Math.round(job.progress)}%</span>
        </div>
        <ProgressBar progress={job.progress} />
      </div>

      <div
        className={cn(
          "grid gap-4",
          skeletonAspect === "9:16" && "grid-cols-2 sm:grid-cols-3",
          skeletonAspect === "1:1" && "grid-cols-2 sm:grid-cols-3",
          skeletonAspect === "16:9" && "grid-cols-1 sm:grid-cols-2"
        )}
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton
              className={cn(
                "w-full",
                skeletonAspect === "9:16" && "aspect-[9/16]",
                skeletonAspect === "1:1" && "aspect-square",
                skeletonAspect === "16:9" && "aspect-video"
              )}
            />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
