import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { hasApiKey } from "@/lib/jev/client";
import { getDashboardData } from "@/lib/metrics/dashboard";
import { fmtLatency } from "@/lib/ui";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const data = getDashboardData();
  const configured = hasApiKey();
  const empty = data.totals.runs === 0;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Dashboard"
        description="Everything here is derived from stored evaluations. Nothing is counted separately."
      />

      <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
        {!configured && (
          <p className="panel px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--color-status-warning)]">
            Running in mock mode. Judgments are deterministic placeholders, clearly labelled
            throughout, and none of them come from Jev. Add TYPESAFE_API_KEY in{" "}
            <code className="num">.env.local</code> to get measured results.
          </p>
        )}

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Stat label="Total runs" value={data.totals.runs} />
          <Stat label="Steps evaluated" value={data.totals.steps} />
          <Stat
            label={configured ? "Jev calls" : "Evaluator calls"}
            value={configured ? data.totals.jevCalls : data.totals.mockCalls}
            hint={
              data.totals.failedCalls > 0 ? `${data.totals.failedCalls} failed` : undefined
            }
          />
          <Stat label="Average latency" value={fmtLatency(data.latency.average)} />
          <Stat
            label="P95 latency"
            value={fmtLatency(data.latency.p95)}
            hint={data.latency.p50 !== null ? `p50 ${fmtLatency(data.latency.p50)}` : undefined}
          />
        </section>

        {empty ? (
          <EmptyState
            title="Nothing observed yet"
            description="Start with a built-in demo: it streams a realistic agent trace through the ingestion API and evaluates every step as it arrives."
            action={
              <Link
                href="/runs"
                className="rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110"
              >
                Go to Runs
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                <h2 className="text-[13px] font-medium">Recent runs</h2>
                <Link
                  href="/runs"
                  className="ml-auto text-[11.5px] text-text-secondary hover:text-text-primary"
                >
                  All runs
                </Link>
              </div>
              <ul>
                {data.recentRuns.map((run) => (
                  <li key={run.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={`/runs/${run.id}`}
                      className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] font-medium">{run.name}</span>
                          <StatusBadge status={run.status} />
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">{run.task}</p>
                      </div>
                      <span className="num shrink-0 text-[11px] text-text-muted">
                        {run.stepCount} steps
                      </span>
                      <span className="num shrink-0 text-[11px] text-text-muted">
                        <LocalTime value={run.startedAt} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b border-border px-3.5 py-2.5">
                <h2 className="text-[13px] font-medium">Interesting events</h2>
                <p className="text-[11px] text-text-muted">
                  Extremes of each signal, and whatever the robustness experiments found least
                  stable. High is not the same as wrong.
                </p>
              </div>
              {data.interesting.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-[12px] text-text-muted">
                  Nothing to flag yet. Run a demo, then run a Decision Lab experiment.
                </p>
              ) : (
                <ul>
                  {data.interesting.map((event) => (
                    <li
                      key={`${event.kind}-${event.stepId}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <Link
                        href={`/runs/${event.runId}`}
                        className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-surface-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11.5px] font-medium">{event.label}</span>
                            <span className="num text-[11.5px] text-text-secondary">
                              {event.value}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-text-muted">
                            {event.runName} · step {event.stepIndex + 1} · {event.content}
                          </p>
                        </div>
                        <ArrowUpRight size={13} className="mt-0.5 shrink-0 text-text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {data.experimentCount > 0 && (
                <p className="border-t border-border px-3.5 py-2 text-[11px] text-text-muted">
                  {data.experimentCount} robustness experiment
                  {data.experimentCount === 1 ? "" : "s"} stored.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="good">completed</Badge>;
  if (status === "failed") return <Badge tone="critical">failed</Badge>;
  return <Badge tone="accent">running</Badge>;
}
