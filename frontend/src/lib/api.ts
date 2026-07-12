import type {
  BeatSyncRequest,
  ClipperRequest,
  HighlightsRequest,
  Job,
} from "./types";

// In dev, Vite's proxy forwards /api and /media to localhost:8000, so an
// empty base works. In production, the frontend and backend are deployed
// separately, so this must point at the deployed backend's URL.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const BASE = `${API_BASE_URL}/api`;

export function resolveMediaUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE_URL}${url}`;
}

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
