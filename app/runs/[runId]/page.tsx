import { notFound } from "next/navigation";

import { RunViewer, type RunViewerData } from "@/components/trace/run-viewer";
import { getDemoRun } from "@/lib/fixtures/demo-runs";
import { getEvaluationsForRun, getRun, getSteps } from "@/lib/trace/ingest";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) notFound();

  const steps = getSteps(runId);
  const evaluations = getEvaluationsForRun(runId);

  const data: RunViewerData = {
    run,
    steps: steps.map((step) => ({ step, evaluation: evaluations.get(step.id) ?? null })),
    demoStepCount: run.demoKey ? getDemoRun(run.demoKey)?.events.length : undefined,
  };

  return <RunViewer initial={data} />;
}
