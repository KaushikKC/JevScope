/**
 * Row <-> domain conversions.
 *
 * JSON columns are parsed exactly once, here, so no component ever calls
 * JSON.parse on a database value.
 */
import type {
  DatasetScenarioRow,
  SemanticEvaluationRow,
  RunRow,
  StepRow,
} from "@/lib/db/schema";
import type { NoulDimension, Phase } from "@/lib/jev/types";

import type { TraceEventInput, TraceRun, TraceStep } from "./types";

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toRun(row: RunRow): TraceRun {
  return {
    id: row.id,
    name: row.name,
    task: row.task,
    systemContext: row.systemContext ?? undefined,
    status: row.status,
    demoKey: row.demoKey ?? undefined,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
  };
}

export function toStep(row: StepRow): TraceStep {
  return {
    id: row.id,
    runId: row.runId,
    index: row.index,
    eventType: row.eventType,
    content: row.content,
    toolName: row.toolName ?? undefined,
    toolArguments: parseJson<unknown>(row.toolArguments, undefined),
    toolResult: parseJson<unknown>(row.toolResult, undefined),
    timestamp: row.timestamp,
  };
}

/** An evaluation as the UI consumes it. `unavailable` carries the failure case. */
export interface SemanticEvaluationView {
  id: string;
  stepId: string;
  unavailable: boolean;
  error?: string;
  nouls: Record<NoulDimension, number>;
  phase: Phase;
  phaseProbabilities: Record<Phase, number>;
  phaseConfidence: number;
  latencyMs: number;
  model: string;
  source: "jev" | "mock";
  requestId?: string;
  requestState: unknown;
  requestQuestions: unknown;
  rawResponse: unknown;
  createdAt: Date;
}

export function toEvaluation(row: SemanticEvaluationRow): SemanticEvaluationView {
  return {
    id: row.id,
    stepId: row.stepId,
    unavailable: Boolean(row.error),
    error: row.error ?? undefined,
    nouls: {
      taskAlignment: row.taskAlignment,
      progress: row.progress,
      repetition: row.repetition,
      stuck: row.stuck,
      needsVerification: row.needsVerification,
      prematureCompletion: row.prematureCompletion,
      unexpectedDirection: row.unexpectedDirection,
    },
    phase: row.phase,
    phaseProbabilities: parseJson<Record<Phase, number>>(
      row.phaseProbabilities,
      {} as Record<Phase, number>,
    ),
    phaseConfidence: row.phaseConfidence,
    latencyMs: row.latencyMs,
    model: row.model,
    source: row.source,
    requestId: row.requestId ?? undefined,
    requestState: parseJson<unknown>(row.requestState, null),
    requestQuestions: parseJson<unknown>(row.requestQuestions, null),
    rawResponse: parseJson<unknown>(row.rawResponse, null),
    createdAt: row.createdAt,
  };
}

export interface ScenarioView {
  id: string;
  datasetId: string;
  name: string;
  task: string;
  history: TraceEventInput[];
  currentStep: TraceEventInput;
  expected?: Record<string, unknown>;
}

export function toScenario(row: DatasetScenarioRow): ScenarioView {
  return {
    id: row.id,
    datasetId: row.datasetId,
    name: row.name,
    task: row.task,
    history: parseJson<TraceEventInput[]>(row.history, []),
    currentStep: parseJson<TraceEventInput>(row.currentStep, {
      eventType: "message",
      content: "",
    }),
    expected: parseJson<Record<string, unknown> | undefined>(row.expected, undefined),
  };
}
