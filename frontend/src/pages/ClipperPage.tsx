import { useState, type FormEvent } from "react";
import { Smartphone, Square, MonitorPlay, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { JobProgress } from "@/components/JobProgress";
import { ResultsGrid } from "@/components/ResultsGrid";
import { useJobPolling } from "@/hooks/useJobPolling";
import { createClipperJob } from "@/lib/api";
import type { AspectRatio } from "@/lib/types";

const aspectOptions = [
  { value: "9:16" as AspectRatio, label: "9:16", description: "TikTok / Reels / Shorts", icon: <Smartphone className="h-4 w-4" /> },
  { value: "1:1" as AspectRatio, label: "1:1", description: "Instagram Feed", icon: <Square className="h-4 w-4" /> },
  { value: "16:9" as AspectRatio, label: "16:9", description: "Landscape", icon: <MonitorPlay className="h-4 w-4" /> },
];

export default function ClipperPage() {
  const [url, setUrl] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [targetDuration, setTargetDuration] = useState(30);
  const [clipCount, setClipCount] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const { job, error } = useJobPolling(jobId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { jobId } = await createClipperJob({ url, aspectRatio, targetDuration, clipCount });
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
        eyebrow="Tool 01"
        title="Smart URL Clipper"
        description="Paste any YouTube link and let the AI find the hook, crop it to your format, and cut it into ready-to-post shorts."
      />

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardBody className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <FieldWrapper label="YouTube URL">
                <Input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </FieldWrapper>

              <FieldWrapper label="Output format">
                <Segmented options={aspectOptions} value={aspectRatio} onChange={setAspectRatio} />
              </FieldWrapper>

              <div className="grid grid-cols-2 gap-3">
                <FieldWrapper label="Clip duration">
                  <Select value={targetDuration} onChange={(e) => setTargetDuration(Number(e.target.value))}>
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Clip count">
                  <Select value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </FieldWrapper>
              </div>

              <Button type="submit" className="w-full" size="lg" icon={<Wand2 className="h-4 w-4" />} loading={submitting}>
                Generate Clips
              </Button>
              {submitError && <p className="text-[13px] text-danger">{submitError}</p>}
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6">
          {!job && !error && (
            <EmptyState
              title="No clips yet"
              description="Drop a YouTube URL on the left to generate AI-picked highlight clips."
            />
          )}
          <JobProgress job={job} error={error} skeletonCount={clipCount} skeletonAspect={aspectRatio} />
          {job && <ResultsGrid job={job} aspect={aspectRatio} />}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated">
        <Wand2 className="h-4 w-4 text-text-tertiary" />
      </div>
      <p className="text-[14px] font-medium text-text-primary">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-text-tertiary">{description}</p>
    </div>
  );
}
