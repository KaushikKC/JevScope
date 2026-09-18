/**
 * DecisionScope experiments.
 *
 * Two questions, deliberately kept apart:
 *
 *   Perturbation  — does the judgment survive a change to the input that a
 *                   human would consider meaning-preserving?
 *   Repeatability — does the judgment survive being asked the same question
 *                   again, with no change at all?
 *
 * They confound each other if measured together, so a perturbation experiment
 * re-evaluates the original state in the same batch: the original-vs-original
 * variance is the floor that any drift has to clear to be about the
 * perturbation rather than about the model's own spread.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { experiments } from "@/lib/db/schema";
import { DEFAULT_MODEL } from "@/lib/jev/client";
import { evaluateState } from "@/lib/jev/evaluate-step";
import { buildQuestions } from "@/lib/jev/questions";
import { NOUL_DIMENSIONS, type JevState, type NoulDimension } from "@/lib/jev/types";
import {
  applyPerturbation,
  describePerturbation,
  type PerturbationConfig,
} from "@/lib/perturbations";
import { compareJudgments, type DriftComparison } from "@/lib/metrics/drift";
import {
  describe,
  describeChoiceStability,
  type Distribution,
  type RepeatabilityReport,
} from "@/lib/metrics/stats";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export interface JudgmentSnapshot {
  nouls: Record<NoulDimension, number>;
  phase: RepeatabilityReport["choice"]["modalPhase"];
  phaseProbabilities: Record<string, number>;
  phaseConfidence: number;
  latencyMs: number;
  model: string;
  source: "jev" | "mock";
  requestId?: string;
  raw: unknown;
}

export interface PerturbationResult {
  config: PerturbationConfig;
  label: string;
  description: string;
  /** The exact transformed state that was sent. Always shown in the UI. */
  state: JevState;
  judgment: JudgmentSnapshot | null;
  error?: string;
  comparison: DriftComparison | null;
}

export interface PerturbationExperimentResult {
  stepId: string;
  model: string;
  source: "jev" | "mock";
  originalState: JevState;
  questions: unknown;
  original: JudgmentSnapshot | null;
  originalError?: string;
  /** A second evaluation of the UNCHANGED state, as a baseline for the drift. */
  control: { judgment: JudgmentSnapshot | null; comparison: DriftComparison | null } | null;
  perturbations: PerturbationResult[];
  createdAt: string;
}

function toSnapshot(outcome: Extract<Awaited<ReturnType<typeof evaluateState>>, { ok: true }>) {
  const { ok: _ok, ...rest } = outcome;
  return rest as JudgmentSnapshot;
}

/**
 * Evaluates the original state, a control re-evaluation of it, and each
 * requested perturbation.
 */
export async function runPerturbationExperiment(
  stepId: string,
  originalState: JevState,
  configs: PerturbationConfig[],
  options: { model?: string; includeControl?: boolean } = {},
): Promise<PerturbationExperimentResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const includeControl = options.includeControl ?? true;

  const originalOutcome = await evaluateState(originalState, { model });
  const original = originalOutcome.ok ? toSnapshot(originalOutcome) : null;

  let control: PerturbationExperimentResult["control"] = null;
  if (includeControl) {
    const controlOutcome = await evaluateState(originalState, { model });
    const controlJudgment = controlOutcome.ok ? toSnapshot(controlOutcome) : null;
    control = {
      judgment: controlJudgment,
      comparison:
        original && controlJudgment ? compareJudgments(original, controlJudgment) : null,
    };
  }

  const perturbations: PerturbationResult[] = [];
  for (const config of configs) {
    const state = applyPerturbation(originalState, config);
    const outcome = await evaluateState(state, { model });
    const judgment = outcome.ok ? toSnapshot(outcome) : null;
    perturbations.push({
      config,
      label: config.kind,
      description: describePerturbation(config),
      state,
      judgment,
      error: outcome.ok ? undefined : outcome.error,
      comparison: original && judgment ? compareJudgments(original, judgment) : null,
    });
  }

  const result: PerturbationExperimentResult = {
    stepId,
    model: original?.model ?? model,
    source: original?.source ?? "jev",
    originalState,
    questions: buildQuestions(),
    original,
    originalError: originalOutcome.ok ? undefined : originalOutcome.error,
    control,
    perturbations,
    createdAt: new Date().toISOString(),
  };

  persist(stepId, "perturbation", { configs, model, includeControl }, result);
  return result;
}

export interface RepeatabilityExperimentResult {
  stepId: string;
  model: string;
  source: "jev" | "mock";
  repeats: number;
  state: JevState;
  questions: unknown;
  /** Every individual judgment, so the raw values behind the summary are visible. */
  samples: JudgmentSnapshot[];
  failures: string[];
  report: RepeatabilityReport | null;
  createdAt: string;
}

/**
 * Evaluates the same state N times, unchanged.
 *
 * Requests are issued sequentially rather than in parallel: it keeps the
 * latency distribution meaningful and stays well clear of the rate limit.
 */
export async function runRepeatabilityExperiment(
  stepId: string,
  state: JevState,
  repeats: number,
  options: { model?: string } = {},
): Promise<RepeatabilityExperimentResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const samples: JudgmentSnapshot[] = [];
  const failures: string[] = [];

  for (let i = 0; i < repeats; i++) {
    const outcome = await evaluateState(state, { model });
    if (outcome.ok) samples.push(toSnapshot(outcome));
    else failures.push(outcome.error);
  }

  const nouls = Object.fromEntries(
    NOUL_DIMENSIONS.map((dimension) => [
      dimension,
      describe(samples.map((sample) => sample.nouls[dimension])),
    ]),
  ) as Record<NoulDimension, Distribution>;

  const report: RepeatabilityReport | null = samples.length
    ? {
        repeats: samples.length,
        nouls,
        choice: describeChoiceStability(
          samples.map((sample) => ({
            phase: sample.phase,
            phaseProbabilities: sample.phaseProbabilities as never,
            phaseConfidence: sample.phaseConfidence,
          })),
        ),
        latencyMs: describe(samples.map((sample) => sample.latencyMs)),
      }
    : null;

  const result: RepeatabilityExperimentResult = {
    stepId,
    model: samples[0]?.model ?? model,
    source: samples[0]?.source ?? "jev",
    repeats,
    state,
    questions: buildQuestions(),
    samples,
    failures,
    report,
    createdAt: new Date().toISOString(),
  };

  persist(stepId, "repeatability", { repeats, model }, result);
  return result;
}

function persist(
  stepId: string,
  kind: "perturbation" | "repeatability",
  config: unknown,
  result: { model: string; source: "jev" | "mock" },
): void {
  db.insert(experiments)
    .values({
      id: newId("exp"),
      stepId,
      kind,
      config: JSON.stringify(config),
      result: JSON.stringify(result),
      source: result.source,
      model: result.model,
      createdAt: new Date(),
    })
    .run();
}

export function listExperimentsForStep(stepId: string, kind?: "perturbation" | "repeatability") {
  const where = kind
    ? and(eq(experiments.stepId, stepId), eq(experiments.kind, kind))
    : eq(experiments.stepId, stepId);
  return db
    .select()
    .from(experiments)
    .where(where)
    .orderBy(desc(experiments.createdAt))
    .all();
}

export function listRecentExperiments(limit = 50) {
  return db
    .select()
    .from(experiments)
    .orderBy(desc(experiments.createdAt))
    .limit(limit)
    .all();
}
