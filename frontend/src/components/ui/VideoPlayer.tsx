import { Download } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { ResultClip } from "@/lib/types";

interface VideoPlayerProps {
  clip: ResultClip;
  aspect?: "9:16" | "1:1" | "16:9";
  index?: number;
}

const aspectClass: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "16:9": "aspect-video",
};

export function VideoPlayer({ clip, aspect = "9:16", index }: VideoPlayerProps) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-bg-elevated transition-colors hover:border-text-tertiary/40">
      <div className={cn("relative w-full bg-black", aspectClass[aspect])}>
        <video
          src={clip.url}
          controls
          preload="metadata"
          className="h-full w-full object-cover"
        />
        {typeof index === "number" && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            #{index + 1}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text-primary">{clip.label}</p>
          <p className="text-[11px] text-text-tertiary">
            {formatTime(clip.start)}–{formatTime(clip.end)}
            {clip.meta ? ` · ${clip.meta}` : ""}
          </p>
        </div>
        <a
          href={clip.url}
          download
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:border-accent/50 hover:text-accent"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
