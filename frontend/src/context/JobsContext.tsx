import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Job } from "@/lib/types";

interface JobsContextValue {
  jobs: Job[];
  upsertJob: (job: Job) => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobsMap, setJobsMap] = useState<Record<string, Job>>({});

  const upsertJob = useCallback((job: Job) => {
    setJobsMap((prev) => ({ ...prev, [job.id]: job }));
  }, []);

  const jobs = useMemo(
    () => Object.values(jobsMap).sort((a, b) => b.createdAt - a.createdAt),
    [jobsMap]
  );

  return <JobsContext.Provider value={{ jobs, upsertJob }}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used within JobsProvider");
  return ctx;
}
