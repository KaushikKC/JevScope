/**
 * Dashboard aggregates.
 *
 * Everything here is derived from stored rows — nothing is tracked separately
 * or counted at call time, so the dashboard cannot drift out of step with the
 * data it summarises.
 */
import "server-only";

import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { experiments, semanticEvaluations, steps } from "@/lib/db/schema";
import { percentile } from "@/lib/metrics/classification";
import type { NoulDimension } from "@/lib/jev/types";
import { toEvaluation, toRun, toStep } from "@/lib/trace/serialize";
import { runs } from "@/lib/db/schema";

import type { PerturbationExperimentResult } from "@/lib/experiments/run";

export interface InterestingEvent {
  kind: string;
  label: string;
  value: string;
  runId: string;
  runName: string;
  stepId: string;
  stepIndex: number;
  content: string;
}

export interface DashboardData {
  totals: {
    runs: number;
    steps: number;
    jevCalls: number;
    failedCalls: number;
    mockCalls: number;
  };
  latency: { average: number | null; p95: number | null; p50: number | null };
  recentRuns: Array<{
    id: string;
    name: string;
    task: string;
    status: string;
    stepCount: number;
    startedAt: Date;
  }>;
  interesting: InterestingEvent[];
  experimentCount: number;
}

export function getDashboardData(): DashboardData {
  const runRows = db.select().from(runs).orderBy(desc(runs.startedAt)).all();
  const stepRows = db.select().from(steps).all();
  const evaluationRows = db.select().from(semanticEvaluations).all();
  const experimentRows = db.select().from(experiments).orderBy(desc(experiments.createdAt)).all();

  const measured = evaluationRows.filter((row) => !row.error);
  const latencies = measured.map((row) => row.latencyMs);

  const runById = new Map(runRows.map((row) => [row.id, toRun(row)]));
  const stepById = new Map(stepRows.map((row) => [row.id, toStep(row)]));
  const stepsByRun = new Map<string, number>();
  for (const step of stepRows) {
    stepsByRun.set(step.runId, (stepsByRun.get(step.runId) ?? 0) + 1);
  }

  return {
    totals: {
      runs: runRows.length,
      steps: stepRows.length,
      // One System One request per evaluated step, successful or not.
      jevCalls: evaluationRows.filter((row) => row.source === "jev").length,
      failedCalls: evaluationRows.filter((row) => row.error).length,
      mockCalls: evaluationRows.filter((row) => row.source === "mock").length,
    },
    latency: {
      average: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
      p50: latencies.length ? Math.round(percentile(latencies, 50)) : null,
      p95: latencies.length ? Math.round(percentile(latencies, 95)) : null,
    },
    recentRuns: runRows.slice(0, 6).map((row) => ({
      id: row.id,
      name: row.name,
      task: row.task,
      status: row.status,
      stepCount: stepsByRun.get(row.id) ?? 0,
      startedAt: row.startedAt,
    })),
    interesting: collectInteresting(
      measured.map(toEvaluation),
      stepById,
      runById,
      experimentRows,
    ),
    experimentCount: experimentRows.length,
  };
}

/**
 * The moments worth opening first: the extremes of each signal, plus whatever
 * the robustness experiments found least stable.
 */
function collectInteresting(
  evaluations: ReturnType<typeof toEvaluation>[],
  stepById: Map<string, ReturnType<typeof toStep>>,
  runById: Map<string, ReturnType<typeof toRun>>,
  experimentRows: Array<{ kind: string; stepId: string; result: string }>,
): InterestingEvent[] {
  const out: InterestingEvent[] = [];

  const extremes: Array<[NoulDimension, string]> = [
    ["stuck", "Highest stuck"],
    ["repetition", "Highest repetition"],
    ["prematureCompletion", "Highest premature completion"],
  ];

  for (const [dimension, label] of extremes) {
    const best = evaluations.reduce<ReturnType<typeof toEvaluation> | null>(
      (top, candidate) =>
        !top || candidate.nouls[dimension] > top.nouls[dimension] ? candidate : top,
      null,
    );
    if (!best || best.nouls[dimension] <= 0) continue;
    const entry = describe(best.stepId, stepById, runById);
    if (entry) {
      out.push({
        ...entry,
        kind: dimension,
        label,
        value: best.nouls[dimension].toFixed(2).replace(/^0/, ""),
      });
    }
  }

  // Largest drift and any choice flip, read back out of the stored experiments.
  let largestDrift: { value: number; stepId: string } | null = null;
  let flips = 0;
  let flipStepId: string | null = null;

  for (const row of experimentRows) {
    if (row.kind !== "perturbation") continue;
    let parsed: PerturbationExperimentResult;
    try {
      parsed = JSON.parse(row.result) as PerturbationExperimentResult;
    } catch {
      continue;
    }
    for (const entry of parsed.perturbations) {
      const summary = entry.comparison?.summary;
      if (!summary) continue;
      if (!largestDrift || summary.maxAbsoluteDrift > largestDrift.value) {
        largestDrift = { value: summary.maxAbsoluteDrift, stepId: row.stepId };
      }
      if (summary.choiceFlips > 0) {
        flips += summary.choiceFlips;
        flipStepId ??= row.stepId;
      }
    }
  }

  if (largestDrift) {
    const entry = describe(largestDrift.stepId, stepById, runById);
    if (entry) {
      out.push({
        ...entry,
        kind: "drift",
        label: "Largest perturbation drift",
        value: largestDrift.value.toFixed(2).replace(/^0/, ""),
      });
    }
  }

  if (flipStepId) {
    const entry = describe(flipStepId, stepById, runById);
    if (entry) {
      out.push({
        ...entry,
        kind: "flip",
        label: "Phase choice flips",
        value: String(flips),
      });
    }
  }

  return out;
}

function describe(
  stepId: string,
  stepById: Map<string, ReturnType<typeof toStep>>,
  runById: Map<string, ReturnType<typeof toRun>>,
): Omit<InterestingEvent, "kind" | "label" | "value"> | null {
  const step = stepById.get(stepId);
  if (!step) return null;
  const run = runById.get(step.runId);
  if (!run) return null;
  return {
    runId: run.id,
    runName: run.name,
    stepId: step.id,
    stepIndex: step.index,
    content: step.content,
  };
}
