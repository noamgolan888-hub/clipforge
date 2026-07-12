import { useState, type FormEvent } from "react";
import { Trophy, ListFilter, Star, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { JobProgress } from "@/components/JobProgress";
import { ResultsGrid } from "@/components/ResultsGrid";
import { EventsTimeline } from "@/components/EventsTimeline";
import { useJobPolling } from "@/hooks/useJobPolling";
import { createHighlightsJob } from "@/lib/api";
import type { SportFocus } from "@/lib/types";

const focusOptions = [
  { value: "all_scores" as SportFocus, label: "All Scores", description: "Every basket / goal", icon: <ListFilter className="h-4 w-4" /> },
  { value: "big_plays" as SportFocus, label: "Big Plays", description: "Only standout moments", icon: <Star className="h-4 w-4" /> },
  { value: "full_summary" as SportFocus, label: "Full Summary", description: "Balanced game recap", icon: <BookOpen className="h-4 w-4" /> },
];

export default function HighlightsPage() {
  const [url, setUrl] = useState("");
  const [sport, setSport] = useState("basketball");
  const [totalDuration, setTotalDuration] = useState(120);
  const [focus, setFocus] = useState<SportFocus>("all_scores");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const { job, error } = useJobPolling(jobId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { jobId } = await createHighlightsJob({ url, totalDuration, sport, focus });
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
        eyebrow="Tool 03"
        title="Sports Highlight Generator"
        description="Drop in a full game recording. Computer vision tracks the scoreboard and action, crowd-noise analysis finds the peaks, and it compiles a highlight reel automatically."
      />

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardBody className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <FieldWrapper label="Game recording URL">
                <Input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </FieldWrapper>

              <FieldWrapper label="Sport">
                <Select value={sport} onChange={(e) => setSport(e.target.value)}>
                  <option value="basketball">Basketball</option>
                  <option value="football">Football (Soccer)</option>
                  <option value="american_football">American Football</option>
                  <option value="hockey">Hockey</option>
                  <option value="other">Other</option>
                </Select>
              </FieldWrapper>

              <FieldWrapper label="Content focus">
                <Segmented options={focusOptions} value={focus} onChange={setFocus} columns={3} />
              </FieldWrapper>

              <FieldWrapper label="Target highlight duration">
                <Select value={totalDuration} onChange={(e) => setTotalDuration(Number(e.target.value))}>
                  <option value={60}>1 minute</option>
                  <option value={120}>2 minutes</option>
                  <option value={180}>3 minutes</option>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                </Select>
              </FieldWrapper>

              <Button type="submit" className="w-full" size="lg" icon={<Trophy className="h-4 w-4" />} loading={submitting}>
                Generate Highlight Reel
              </Button>
              {submitError && <p className="text-[13px] text-danger">{submitError}</p>}
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6">
          {!job && !error && (
            <EmptyState
              title="No highlight reel yet"
              description="Drop a full game URL on the left to auto-generate a highlight reel."
            />
          )}
          <JobProgress job={job} error={error} skeletonCount={1} skeletonAspect="16:9" />
          {job && job.status === "done" && (
            <>
              <ResultsGrid job={job} aspect="16:9" />
              {job.events && <EventsTimeline events={job.events} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated">
        <Trophy className="h-4 w-4 text-text-tertiary" />
      </div>
      <p className="text-[14px] font-medium text-text-primary">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-text-tertiary">{description}</p>
    </div>
  );
}
