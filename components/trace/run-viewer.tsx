"use client";

/**
 * The Run Viewer.
 *
 * Three panes: what happened (left), what it was (centre), what it meant
 * (right), with the semantic trace across the top tying them together. Every
 * surface selects the same step, so a spike in the chart, a card in the
 * timeline, and the raw response are always looking at the same moment.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, RotateCw } from "lucide-react";

import { SemanticTimeline, type TimelinePoint } from "@/components/charts/semantic-timeline";
import { SignalStrips } from "@/components/charts/signal-strip";
import { SECONDARY_DIMENSIONS } from "@/lib/jev/presentation";
import type { SemanticEvaluationView } from "@/lib/trace/serialize";
import type { TraceEventInput, TraceRun, TraceStep } from "@/lib/trace/types";
import { fmtLatency } from "@/lib/ui";

import { Badge, Button, Stat } from "@/components/ui/primitives";
import { EventCard } from "./event-card";
import { LiveDuration } from "./live-duration";
import { EvaluationPanel } from "./evaluation-panel";
import { StepDetail } from "./step-detail";

export interface RunViewerData {
  run: TraceRun;
  steps: Array<{ step: TraceStep; evaluation: SemanticEvaluationView | null }>;
  /** Number of fixture events, when this run came from a demo. */
  demoStepCount?: number;
}

export function RunViewer({ initial }: { initial: RunViewerData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    initial.steps.at(0)?.step.id ?? null,
  );
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const selected = data.steps.find((entry) => entry.step.id === selectedStepId) ?? data.steps[0];

  const measured = data.steps
    .map((entry) => entry.evaluation)
    .filter((evaluation): evaluation is SemanticEvaluationView =>
      Boolean(evaluation && !evaluation.unavailable),
    );

  const averageLatency = measured.length
    ? Math.round(measured.reduce((total, e) => total + e.latencyMs, 0) / measured.length)
    : null;

  const points: TimelinePoint[] = useMemo(
    () =>
      data.steps.map(({ step, evaluation }) => ({
        step: step.index + 1,
        stepId: step.id,
        eventType: step.eventType,
        phase: evaluation && !evaluation.unavailable ? evaluation.phase : null,
        unavailable: Boolean(evaluation?.unavailable) || evaluation === null,
        values: evaluation && !evaluation.unavailable ? evaluation.nouls : {},
      })),
    [data.steps],
  );

  const pendingCount = data.demoStepCount ? data.demoStepCount - data.steps.length : 0;

  /**
   * Streams the remaining demo events through the ordinary ingestion endpoint,
   * one at a time. Sequential on purpose: you watch each judgment arrive, and
   * each step's state legitimately contains the ones before it.
   */
  const simulate = useCallback(async () => {
    if (!data.run.demoKey || simulating) return;
    cancelled.current = false;
    setSimulating(true);
    setSimulationError(null);

    try {
      const response = await fetch(`/api/demo?key=${encodeURIComponent(data.run.demoKey)}`);
      if (!response.ok) throw new Error("Could not load the demo events.");
      const { events } = (await response.json()) as { events: TraceEventInput[] };

      for (const event of events.slice(data.steps.length)) {
        if (cancelled.current) break;

        const ingest = await fetch(`/api/runs/${data.run.id}/steps`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
        });

        if (!ingest.ok) throw new Error(`Ingestion failed with HTTP ${ingest.status}.`);

        const result = (await ingest.json()) as {
          step: TraceStep;
          evaluation: SemanticEvaluationView | null;
        };

        setData((current) => ({
          ...current,
          steps: [...current.steps, result],
        }));
        setSelectedStepId(result.step.id);
      }

      router.refresh();
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  }, [data.run.demoKey, data.run.id, data.steps.length, router, simulating]);

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-border px-6 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[16px] font-semibold tracking-tight">
                {data.run.name}
              </h1>
              <StatusBadge status={data.run.status} />
            </div>
            <p className="mt-0.5 max-w-3xl text-[12.5px] text-text-secondary">{data.run.task}</p>
          </div>

          {data.run.demoKey && pendingCount > 0 && (
            <Button variant="primary" onClick={simulate} disabled={simulating}>
              {simulating ? (
                <>
                  <RotateCw size={12} className="animate-spin" />
                  Evaluating… {data.steps.length}/{data.demoStepCount}
                </>
              ) : (
                <>
                  <Play size={12} />
                  {data.steps.length === 0
                    ? "Start simulation"
                    : `Continue (${pendingCount} left)`}
                </>
              )}
            </Button>
          )}
        </div>

        {simulationError && (
          <p className="mt-2 text-[11.5px] text-[var(--color-status-critical)]">
            {simulationError}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Steps" value={data.steps.length} />
          <Stat
            label="Evaluations"
            value={measured.length}
            hint={
              data.steps.length !== measured.length
                ? `${data.steps.length - measured.length} unavailable`
                : undefined
            }
          />
          <Stat label="Avg Jev latency" value={fmtLatency(averageLatency)} />
          <Stat
            label="Duration"
            value={
              <LiveDuration
                startedAt={data.run.startedAt}
                finishedAt={data.run.finishedAt}
              />
            }
          />
          <Stat
            label="Model"
            value={<span className="text-[13px]">{measured[0]?.model ?? "—"}</span>}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-3 px-6 py-4">
          <SemanticTimeline
            points={points}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />
          <SignalStrips
            points={points}
            dimensions={SECONDARY_DIMENSIONS}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 px-6 pb-6 lg:grid-cols-[300px_minmax(0,1fr)_400px]">
          <section className="panel flex max-h-[640px] flex-col overflow-hidden">
            <h2 className="border-b border-border px-3.5 py-2.5 text-[13px] font-medium">
              Timeline
            </h2>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-2">
              {data.steps.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] text-text-muted">
                  No steps yet.
                </p>
              ) : (
                data.steps.map(({ step, evaluation }) => (
                  <EventCard
                    key={step.id}
                    step={step}
                    evaluation={evaluation}
                    selected={step.id === selectedStepId}
                    onSelect={() => setSelectedStepId(step.id)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="panel max-h-[640px] overflow-hidden">
            {selected ? (
              <StepDetail step={selected.step} />
            ) : (
              <p className="px-4 py-6 text-[12px] text-text-muted">Select a step.</p>
            )}
          </section>

          <section className="panel max-h-[640px] overflow-hidden">
            {selected ? (
              <EvaluationPanel evaluation={selected.evaluation} stepId={selected.step.id} />
            ) : (
              <p className="px-4 py-6 text-[12px] text-text-muted">Select a step.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TraceRun["status"] }) {
  if (status === "completed") return <Badge tone="good">completed</Badge>;
  if (status === "failed") return <Badge tone="critical">failed</Badge>;
  return <Badge tone="accent">running</Badge>;
}
