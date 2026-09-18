import { DecisionLab, type LabStep } from "@/components/decision-lab/decision-lab";
import { PageHeader } from "@/components/ui/primitives";
import { getEvaluationsForRun, getSteps, listRuns } from "@/lib/trace/ingest";

export const dynamic = "force-dynamic";

export default async function DecisionLabPage({
  searchParams,
}: {
  searchParams: Promise<{ stepId?: string }>;
}) {
  const { stepId } = await searchParams;

  // Only steps that already carry a measured judgment: the lab compares against
  // an original, so there has to be one.
  const steps: LabStep[] = listRuns().flatMap((run) => {
    const evaluations = getEvaluationsForRun(run.id);
    return getSteps(run.id)
      .filter((step) => {
        const evaluation = evaluations.get(step.id);
        return evaluation && !evaluation.unavailable;
      })
      .map((step) => ({
        id: step.id,
        runId: run.id,
        runName: run.name,
        task: run.task,
        index: step.index,
        eventType: step.eventType,
        content: step.content,
      }));
  });

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="DecisionScope Lab"
        description="How stable is one semantic judgment? Change the input in ways that should not matter, or change nothing at all, and measure what moves."
      />
      <DecisionLab steps={steps} initialStepId={stepId} />
    </div>
  );
}
