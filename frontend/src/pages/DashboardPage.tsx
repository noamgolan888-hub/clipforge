import { Link } from "react-router-dom";
import { Scissors, AudioLines, Trophy, ArrowUpRight, Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useJobs } from "@/context/JobsContext";
import type { Job, ToolType } from "@/lib/types";
import { cn } from "@/lib/utils";

const tools: {
  to: string;
  tool: ToolType;
  title: string;
  description: string;
  icon: typeof Scissors;
  gradient: string;
}[] = [
  {
    to: "/clipper",
    tool: "clipper",
    title: "Smart Clipper",
    description: "Turn one long video into a batch of scroll-stopping shorts.",
    icon: Scissors,
    gradient: "from-[#7c5cff] to-[#a855f7]",
  },
  {
    to: "/beat-sync",
    tool: "beatsync",
    title: "Beat-Synced Edit",
    description: "Multi-clip edits cut perfectly on the beat, automatically.",
    icon: AudioLines,
    gradient: "from-[#22d3ee] to-[#7c5cff]",
  },
  {
    to: "/highlights",
    tool: "highlights",
    title: "Sports Highlights",
    description: "Full games in, highlight reels out — every score, captured.",
    icon: Trophy,
    gradient: "from-[#fbbf24] to-[#f87171]",
  },
];

const statusTone: Record<string, "neutral" | "accent" | "success" | "danger"> = {
  done: "success",
  error: "danger",
};

export default function DashboardPage() {
  const { jobs } = useJobs();

  return (
    <div>
      <PageHeader
        eyebrow="Welcome back"
        title="What are we creating today?"
        description="Pick a tool to turn raw footage into publish-ready content in minutes."
      />

      <div className="grid gap-5 sm:grid-cols-3">
        {tools.map((t) => (
          <Link key={t.to} to={t.to} className="group">
            <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-text-tertiary/40">
              <CardBody>
                <div
                  className={cn(
                    "mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-[0_0_24px_-6px_rgba(124,92,255,0.5)]",
                    t.gradient
                  )}
                >
                  <t.icon className="h-5 w-5 text-white" />
                </div>
                <div className="mb-1 flex items-center gap-1.5">
                  <h3 className="font-display text-[15px] font-semibold text-text-primary">
                    {t.title}
                  </h3>
                  <ArrowUpRight className="h-3.5 w-3.5 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
                </div>
                <p className="text-[13px] leading-relaxed text-text-secondary">{t.description}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">
          Recent activity
        </h2>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <Clock className="mb-2 h-5 w-5 text-text-tertiary" />
            <p className="text-[13px] text-text-tertiary">
              Your generated projects will show up here.
            </p>
          </div>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {jobs.slice(0, 8).map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const tool = tools.find((t) => t.tool === job.tool);
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="flex items-center gap-3">
        {tool && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br",
              tool.gradient
            )}
          >
            <tool.icon className="h-3.5 w-3.5 text-white" />
          </span>
        )}
        <div>
          <p className="text-[13px] font-medium text-text-primary">{job.title || "Untitled project"}</p>
          <p className="text-[11px] text-text-tertiary">{tool?.title}</p>
        </div>
      </div>
      <Badge tone={statusTone[job.status] ?? "accent"}>
        {job.status === "done" ? "Complete" : job.status === "error" ? "Failed" : "Processing"}
      </Badge>
    </div>
  );
}
