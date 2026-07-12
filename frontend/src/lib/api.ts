import type {
  BeatSyncRequest,
  ClipperRequest,
  HighlightsRequest,
  Job,
} from "./types";

const BASE = "/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || "Request failed");
  return data as T;
}

export async function createClipperJob(req: ClipperRequest) {
  return postJson<{ jobId: string }>("/clipper/jobs", req);
}

export async function createBeatSyncJob(req: BeatSyncRequest) {
  return postJson<{ jobId: string }>("/beatsync/jobs", req);
}

export async function createHighlightsJob(req: HighlightsRequest) {
  return postJson<{ jobId: string }>("/highlights/jobs", req);
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/jobs/${jobId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || "Job not found");
  return data as Job;
}
