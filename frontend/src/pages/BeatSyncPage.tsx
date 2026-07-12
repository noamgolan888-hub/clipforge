import { useState, type FormEvent } from "react";
import { Plus, X, Zap, Waves, Film, Music2, Clapperboard } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { JobProgress } from "@/components/JobProgress";
import { ResultsGrid } from "@/components/ResultsGrid";
import { useJobPolling } from "@/hooks/useJobPolling";
import { createBeatSyncJob } from "@/lib/api";
import type { EditStyle } from "@/lib/types";

const MAX_VIDEOS = 5;

const styleOptions = [
  { value: "aggressive" as EditStyle, label: "Aggressive", description: "Fast cuts on every beat", icon: <Zap className="h-4 w-4" /> },
  { value: "smooth" as EditStyle, label: "Smooth", description: "Flowing transitions", icon: <Waves className="h-4 w-4" /> },
  { value: "cinematic" as EditStyle, label: "Cinematic", description: "Slower, dramatic pacing", icon: <Film className="h-4 w-4" /> },
];

export default function BeatSyncPage() {
  const [videoUrls, setVideoUrls] = useState<string[]>(["", ""]);
  const [musicUrl, setMusicUrl] = useState("");
  const [totalDuration, setTotalDuration] = useState(30);
  const [style, setStyle] = useState<EditStyle>("aggressive");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const { job, error } = useJobPolling(jobId);

  function updateVideoUrl(index: number, value: string) {
    setVideoUrls((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function addVideoField() {
    if (videoUrls.length < MAX_VIDEOS) setVideoUrls((prev) => [...prev, ""]);
  }

  function removeVideoField(index: number) {
    setVideoUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const urls = videoUrls.map((u) => u.trim()).filter(Boolean);
      const { jobId } = await createBeatSyncJob({ videoUrls: urls, musicUrl, totalDuration, style });
      setJobId(jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to start job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tool 02"
        title="Beat-Synced Edit"
        description="Feed in up to 5 clips and a track. The AI detects the beat, finds the highest-energy moments, and cuts everything perfectly on-tempo."
      />

      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <Card className="h-fit">
          <CardBody className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <FieldWrapper label={`Video sources (${videoUrls.length}/${MAX_VIDEOS})`}>
                <div className="space-y-2">
                  {videoUrls.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex h-9 w-7 shrink-0 items-center justify-center text-[11px] font-semibold text-text-tertiary">
                        {i + 1}
                      </div>
                      <Input
                        type="text"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={v}
                        onChange={(e) => updateVideoUrl(i, e.target.value)}
                        required
                      />
                      {videoUrls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeVideoField(i)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {videoUrls.length < MAX_VIDEOS && (
                  <button
                    type="button"
                    onClick={addVideoField}
                    className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:text-accent-hover"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add another video
                  </button>
                )}
              </FieldWrapper>

              <FieldWrapper label="Music track URL">
                <div className="relative">
                  <Music2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={musicUrl}
                    onChange={(e) => setMusicUrl(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </FieldWrapper>

              <FieldWrapper label="Editing style">
                <Segmented options={styleOptions} value={style} onChange={setStyle} />
              </FieldWrapper>

              <FieldWrapper label="Total edit duration">
                <Select value={totalDuration} onChange={(e) => setTotalDuration(Number(e.target.value))}>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds</option>
                  <option value={90}>90 seconds</option>
                </Select>
              </FieldWrapper>

              <Button type="submit" className="w-full" size="lg" icon={<Clapperboard className="h-4 w-4" />} loading={submitting}>
                Create Beat-Synced Edit
              </Button>
              {submitError && <p className="text-[13px] text-danger">{submitError}</p>}
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6">
          {!job && !error && (
            <EmptyState
              title="No edit yet"
              description="Add your source clips and a track to generate a beat-matched edit."
            />
          )}
          <JobProgress job={job} error={error} skeletonCount={1} skeletonAspect="16:9" />
          {job && <ResultsGrid job={job} aspect="16:9" />}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated">
        <Waves className="h-4 w-4 text-text-tertiary" />
      </div>
      <p className="text-[14px] font-medium text-text-primary">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-text-tertiary">{description}</p>
    </div>
  );
}
