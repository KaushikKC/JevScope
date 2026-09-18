import Link from "next/link";

import { DemoLauncher } from "@/components/trace/demo-launcher";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DEMO_RUNS } from "@/lib/fixtures/demo-runs";
import { getEvaluationsForRun, getSteps, listRuns } from "@/lib/trace/ingest";
import { fmtDateTime, fmtLatency } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  const runs = listRuns().map((run) => {
    const steps = getSteps(run.id);
    const evaluations = [...getEvaluationsForRun(run.id).values()].filter((e) => !e.unavailable);
    return {
      ...run,
      stepCount: steps.length,
      evaluationCount: evaluations.length,
      averageLatencyMs: evaluations.length
        ? Math.round(evaluations.reduce((a, e) => a + e.latencyMs, 0) / evaluations.length)
        : null,
      source: evaluations[0]?.source,
    };
  });

  const demos = DEMO_RUNS.map(({ key, name, task, hypothesis, events }) => ({
    key,
    name,
    task,
    hypothesis,
    stepCount: events.length,
  }));

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Runs"
        description="Each run is one agent execution. Open one to see what it was doing semantically, step by step."
      />

      <div className="flex-1 space-y-6 overflow-auto px-6 py-5">
        <DemoLauncher demos={demos} />

        <section>
          <h2 className="mb-2 text-[13px] font-medium">All runs</h2>
          {runs.length === 0 ? (
            <EmptyState
              title="No runs yet"
              description="Create one from a built-in demo above, or POST a run to /api/runs and stream its steps to /api/runs/:runId/steps."
            />
          ) : (
            <div className="panel overflow-hidden">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="label-caps px-3.5 py-2">Run</th>
                    <th className="label-caps px-3.5 py-2">Status</th>
                    <th className="label-caps px-3.5 py-2 text-right">Steps</th>
                    <th className="label-caps px-3.5 py-2 text-right">Evaluated</th>
                    <th className="label-caps px-3.5 py-2 text-right">Avg latency</th>
                    <th className="label-caps px-3.5 py-2 text-right">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b border-border last:border-b-0">
                      <td className="px-3.5 py-2">
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-[12.5px] font-medium hover:text-[var(--color-accent)]"
                        >
                          {run.name}
                        </Link>
                        <p className="mt-0.5 line-clamp-1 max-w-md text-[11px] text-text-muted">
                          {run.task}
                        </p>
                      </td>
                      <td className="px-3.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={run.status} />
                          {run.source === "mock" && <Badge tone="warning">MOCK</Badge>}
                        </div>
                      </td>
                      <td className="num px-3.5 py-2 text-right text-[12px]">{run.stepCount}</td>
                      <td className="num px-3.5 py-2 text-right text-[12px]">
                        {run.evaluationCount}
                      </td>
                      <td className="num px-3.5 py-2 text-right text-[12px] text-text-secondary">
                        {fmtLatency(run.averageLatencyMs)}
                      </td>
                      <td className="num px-3.5 py-2 text-right text-[11.5px] text-text-muted">
                        {fmtDateTime(run.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "running" | "completed" | "failed" }) {
  if (status === "completed") return <Badge tone="good">completed</Badge>;
  if (status === "failed") return <Badge tone="critical">failed</Badge>;
  return <Badge tone="accent">running</Badge>;
}
