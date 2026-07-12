export type ToolType = "clipper" | "beatsync" | "highlights";

export type JobStatus =
  | "queued"
  | "fetching_info"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "detecting_beats"
  | "detecting_events"
  | "rendering"
  | "done"
  | "error";

export interface ResultClip {
  id: string;
  url: string;
  thumbnailUrl?: string;
  label: string;
  start: number;
  end: number;
  durationSeconds: number;
  meta?: string;
}

export interface Job {
  id: string;
  tool: ToolType;
  status: JobStatus;
  message: string;
  progress: number;
  title: string;
  createdAt: number;
  clips: ResultClip[];
  events?: DetectedEvent[];
  error?: string | null;
}

export interface DetectedEvent {
  id: string;
  label: string;
  timestamp: number;
  confidence: number;
}

export type AspectRatio = "9:16" | "1:1" | "16:9";

export interface ClipperRequest {
  url: string;
  aspectRatio: AspectRatio;
  targetDuration: number;
  clipCount: number;
}

export type EditStyle = "aggressive" | "smooth" | "cinematic";

export interface BeatSyncRequest {
  videoUrls: string[];
  musicUrl: string;
  totalDuration: number;
  style: EditStyle;
}

export type SportFocus = "all_scores" | "big_plays" | "full_summary";

export interface HighlightsRequest {
  url: string;
  totalDuration: number;
  sport: string;
  focus: SportFocus;
}
