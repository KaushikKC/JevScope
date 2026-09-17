/**
 * Trace ingestion.
 *
 * This is the seam between "collect what the agent did" and "judge what it
 * meant". Steps are persisted before evaluation is attempted and independently
 * of whether it succeeds, so a TypeSafe outage costs you judgments, never data.
 */
import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { runs, semanticEvaluations, steps } from "@/lib/db/schema";
import { buildState, type BuildStateOptions } from "@/lib/jev/build-state";
import { DEFAULT_MODEL } from "@/lib/jev/client";
import { buildQuestions, evaluateState } from "@/lib/jev/evaluate-step";
import { NOUL_DIMENSIONS, type JevState } from "@/lib/jev/types";

import {
  toEvaluation,
  toRun,
  toStep,
  type SemanticEvaluationView,
} from "./serialize";
import {
  coerceTimestamp,
  type CreateRunInput,
  type TraceEventInput,
  type TraceRun,
  type TraceStep,
} from "./types";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function createRun(input: CreateRunInput & { demoKey?: string }): TraceRun {
  const row = {
    id: newId("run"),
    name: input.name,
    task: input.task,
    systemContext: input.systemContext ?? null,
    status: input.status ?? ("running" as const),
    demoKey: input.demoKey ?? null,
    startedAt: new Date(),
    finishedAt: null,
  };
  db.insert(runs).values(row).run();
  return toRun(row);
}

export function getRun(runId: string): TraceRun | null {
  const row = db.select().from(runs).where(eq(runs.id, runId)).get();
  return row ? toRun(row) : null;
}

export function listRuns(): TraceRun[] {
  return db.select().from(runs).orderBy(desc(runs.startedAt)).all().map(toRun);
}

export function getSteps(runId: string): TraceStep[] {
  return db
    .select()
    .from(steps)
    .where(eq(steps.runId, runId))
    .orderBy(asc(steps.index))
    .all()
    .map(toStep);
}

export function getStep(stepId: string): TraceStep | null {
  const row = db.select().from(steps).where(eq(steps.id, stepId)).get();
  return row ? toStep(row) : null;
}

export function getEvaluationsForRun(runId: string): Map<string, SemanticEvaluationView> {
  const stepRows = db.select({ id: steps.id }).from(steps).where(eq(steps.runId, runId)).all();
  if (stepRows.length === 0) return new Map();
  const rows = db
    .select()
    .from(semanticEvaluations)
    .where(
      inArray(
        semanticEvaluations.stepId,
        stepRows.map((s) => s.id),
      ),
    )
    .all();
  return new Map(rows.map((row) => [row.stepId, toEvaluation(row)]));
}

export function getEvaluationForStep(stepId: string): SemanticEvaluationView | null {
  const row = db
    .select()
    .from(semanticEvaluations)
    .where(eq(semanticEvaluations.stepId, stepId))
    .get();
  return row ? toEvaluation(row) : null;
}

export function updateRunStatus(
  runId: string,
  status: TraceRun["status"],
  finishedAt?: Date,
): void {
  db.update(runs)
    .set({ status, finishedAt: finishedAt ?? (status === "running" ? null : new Date()) })
    .where(eq(runs.id, runId))
    .run();
}

export interface IngestResult {
  step: TraceStep;
  evaluation: SemanticEvaluationView | null;
  /** Populated when Jev could not be reached. The step is still stored. */
  evaluationError?: string;
}

/**
 * Persists one event and evaluates it.
 *
 * Order matters: the step row is committed first. Everything after it is
 * best-effort.
 */
export async function ingestStep(
  runId: string,
  event: TraceEventInput,
  options: BuildStateOptions = {},
): Promise<IngestResult> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  const history = getSteps(runId);
  const index = history.length;

  const stepRow = {
    id: newId("step"),
    runId,
    index,
    eventType: event.eventType,
    content: event.content,
    toolName: event.toolName ?? null,
    toolArguments:
      event.toolArguments === undefined ? null : JSON.stringify(event.toolArguments),
    toolResult: event.toolResult === undefined ? null : JSON.stringify(event.toolResult),
    timestamp: coerceTimestamp(event.timestamp),
  };

  db.insert(steps).values(stepRow).run();
  const step = toStep(stepRow);

  const state = buildState(
    {
      task: run.task,
      systemContext: run.systemContext,
      currentStep: { ...step, index },
      history,
    },
    options,
  );

  const evaluation = await persistEvaluation(step.id, state);

  if (event.eventType === "completion" && run.status === "running") {
    updateRunStatus(runId, "completed");
  }

  return evaluation.evaluation
    ? { step, evaluation: evaluation.evaluation }
    : { step, evaluation: null, evaluationError: evaluation.error };
}

/**
 * Runs the evaluator over a state and stores the outcome against a step.
 * Returns the stored view, or the error message when evaluation failed.
 */
export async function persistEvaluation(
  stepId: string,
  state: JevState,
  options: { model?: string } = {},
): Promise<{ evaluation: SemanticEvaluationView | null; error?: string }> {
  const questions = buildQuestions();
  const outcome = await evaluateState(state, { model: options.model });

  const base = {
    id: newId("eval"),
    stepId,
    requestState: JSON.stringify(state),
    requestQuestions: JSON.stringify(questions),
    createdAt: new Date(),
  };

  if (!outcome.ok) {
    // A placeholder row records that evaluation was attempted and failed. The
    // numeric columns are zero and `error` is set; the UI reads `unavailable`
    // and shows "evaluation unavailable" rather than any of these values.
    const row = {
      ...base,
      taskAlignment: 0,
      progress: 0,
      repetition: 0,
      stuck: 0,
      needsVerification: 0,
      prematureCompletion: 0,
      unexpectedDirection: 0,
      phase: "unclear" as const,
      phaseProbabilities: "{}",
      phaseConfidence: 0,
      latencyMs: outcome.latencyMs,
      model: outcome.model,
      source: "jev" as const,
      rawResponse: "null",
      requestId: null,
      error: outcome.error,
    };
    db.insert(semanticEvaluations).values(row).run();
    return { evaluation: null, error: outcome.error };
  }

  const row = {
    ...base,
    taskAlignment: outcome.nouls.taskAlignment,
    progress: outcome.nouls.progress,
    repetition: outcome.nouls.repetition,
    stuck: outcome.nouls.stuck,
    needsVerification: outcome.nouls.needsVerification,
    prematureCompletion: outcome.nouls.prematureCompletion,
    unexpectedDirection: outcome.nouls.unexpectedDirection,
    phase: outcome.phase,
    phaseProbabilities: JSON.stringify(outcome.phaseProbabilities),
    phaseConfidence: outcome.phaseConfidence,
    latencyMs: outcome.latencyMs,
    model: outcome.model,
    source: outcome.source,
    rawResponse: JSON.stringify(outcome.raw),
    requestId: outcome.requestId ?? null,
    error: null,
  };

  db.insert(semanticEvaluations).values(row).run();
  return { evaluation: toEvaluation(row) };
}

/** Re-exported so API routes don't reach into lib/jev directly. */
export { DEFAULT_MODEL, NOUL_DIMENSIONS };
