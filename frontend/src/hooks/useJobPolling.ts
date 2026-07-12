import { useEffect, useRef, useState } from "react";
import { getJob } from "@/lib/api";
import type { Job } from "@/lib/types";
import { useJobs } from "@/context/JobsContext";

const TERMINAL_STATUSES = new Set(["done", "error"]);

export function useJobPolling(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const { upsertJob } = useJobs();

  useEffect(() => {
    setJob(null);
    setError(null);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (!jobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const data = await getJob(jobId);
        if (cancelled) return;
        setJob(data);
        upsertJob(data);
        if (TERMINAL_STATUSES.has(data.status) && intervalRef.current) {
          window.clearInterval(intervalRef.current);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong");
        if (intervalRef.current) window.clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = window.setInterval(poll, 1200);

    return () => {
      cancelled = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [jobId, upsertJob]);

  return { job, error };
}
