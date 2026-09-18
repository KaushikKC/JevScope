/**
 * Labelled dataset storage and scoring.
 *
 * Predictions are stored as raw probabilities, never as thresholded decisions.
 * That is what lets the threshold explorer move the operating point after the
 * fact without re-spending credit — and it keeps the stored artifact free of a
 * choice that belongs to whoever reads it.
 */
import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { datasetRuns, datasets, datasetScenarios } from "@/lib/db/schema";
import { buildStateFromScenario } from "@/lib/jev/build-state";
import { DEFAULT_MODEL } from "@/lib/jev/client";
import { evaluateState } from "@/lib/jev/evaluate-step";
import { NOUL_DIMENSIONS, type NoulDimension, type Phase } from "@/lib/jev/types";
import {
  binaryMetrics,
  choiceAccuracy,
  type BinaryMetrics,
  type ChoiceAccuracy,
  type LabelledPrediction,
} from "@/lib/metrics/classification";
import { toScenario, type ScenarioView } from "@/lib/trace/serialize";

import type { DatasetInput, ExpectedLabels } from "@/lib/fixtures/benchmark";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export interface DatasetSummary {
  id: string;
  name: string;
  description?: string;
  scenarioCount: number;
  labelledCount: number;
  createdAt: Date;
  latestRunAt?: Date;
}

export function importDataset(input: DatasetInput): DatasetSummary {
  const datasetId = newId("ds");
  db.insert(datasets)
    .values({
      id: datasetId,
      name: input.name,
      description: input.description ?? null,
      createdAt: new Date(),
    })
    .run();

  for (const scenario of input.scenarios) {
    db.insert(datasetScenarios)
      .values({
        id: newId("scn"),
        datasetId,
        name: scenario.name,
        task: scenario.task,
        history: JSON.stringify(scenario.history ?? []),
        currentStep: JSON.stringify(scenario.currentStep),
        expected: scenario.expected ? JSON.stringify(scenario.expected) : null,
      })
      .run();
  }

  return getDataset(datasetId)!;
}

export function listDatasets(): DatasetSummary[] {
  return db
    .select()
    .from(datasets)
    .orderBy(desc(datasets.createdAt))
    .all()
    .map((row) => summarize(row.id, row.name, row.description, row.createdAt));
}

export function getDataset(datasetId: string): DatasetSummary | null {
  const row = db.select().from(datasets).where(eq(datasets.id, datasetId)).get();
  return row ? summarize(row.id, row.name, row.description, row.createdAt) : null;
}

function summarize(
  id: string,
  name: string,
  description: string | null,
  createdAt: Date,
): DatasetSummary {
  const scenarios = getScenarios(id);
  const latest = db
    .select({ createdAt: datasetRuns.createdAt })
    .from(datasetRuns)
    .where(eq(datasetRuns.datasetId, id))
    .orderBy(desc(datasetRuns.createdAt))
    .get();

  return {
    id,
    name,
    description: description ?? undefined,
    scenarioCount: scenarios.length,
    labelledCount: scenarios.filter((s) => s.expected && Object.keys(s.expected).length > 0).length,
    createdAt,
    latestRunAt: latest?.createdAt,
  };
}

export function getScenarios(datasetId: string): ScenarioView[] {
  return db
    .select()
    .from(datasetScenarios)
    .where(eq(datasetScenarios.datasetId, datasetId))
    .all()
    .map(toScenario);
}

export function deleteDataset(datasetId: string): void {
  db.delete(datasets).where(eq(datasets.id, datasetId)).run();
}

/** One scenario's raw prediction. No threshold has been applied. */
export interface ScenarioPrediction {
  scenarioId: string;
  name: string;
  nouls: Record<NoulDimension, number> | null;
  phase: Phase | null;
  phaseConfidence: number | null;
  phaseProbabilities: Record<string, number> | null;
  latencyMs: number;
  expected?: ExpectedLabels;
  error?: string;
}

export interface DatasetRunSummary {
  id: string;
  datasetId: string;
  model: string;
  source: "jev" | "mock";
  predictions: ScenarioPrediction[];
  createdAt: Date;
}

/** Evaluates every scenario once and stores the raw probabilities. */
export async function evaluateDataset(
  datasetId: string,
  options: { historyWindow?: number } = {},
): Promise<DatasetRunSummary> {
  const scenarios = getScenarios(datasetId);
  const predictions: ScenarioPrediction[] = [];
  let model = DEFAULT_MODEL;
  let source: "jev" | "mock" = "jev";

  for (const scenario of scenarios) {
    const state = buildStateFromScenario(scenario, { historyWindow: options.historyWindow });
    const outcome = await evaluateState(state);

    if (!outcome.ok) {
      predictions.push({
        scenarioId: scenario.id,
        name: scenario.name,
        nouls: null,
        phase: null,
        phaseConfidence: null,
        phaseProbabilities: null,
        latencyMs: outcome.latencyMs,
        expected: scenario.expected as ExpectedLabels | undefined,
        error: outcome.error,
      });
      continue;
    }

    model = outcome.model;
    source = outcome.source;
    predictions.push({
      scenarioId: scenario.id,
      name: scenario.name,
      nouls: outcome.nouls,
      phase: outcome.phase,
      phaseConfidence: outcome.phaseConfidence,
      phaseProbabilities: outcome.phaseProbabilities,
      latencyMs: outcome.latencyMs,
      expected: scenario.expected as ExpectedLabels | undefined,
    });
  }

  const row = {
    id: newId("dsrun"),
    datasetId,
    model,
    source,
    predictions: JSON.stringify(predictions),
    createdAt: new Date(),
  };
  db.insert(datasetRuns).values(row).run();

  return { ...row, predictions };
}

export function getLatestDatasetRun(datasetId: string): DatasetRunSummary | null {
  const row = db
    .select()
    .from(datasetRuns)
    .where(eq(datasetRuns.datasetId, datasetId))
    .orderBy(desc(datasetRuns.createdAt))
    .get();
  if (!row) return null;
  return {
    id: row.id,
    datasetId: row.datasetId,
    model: row.model,
    source: row.source,
    predictions: JSON.parse(row.predictions) as ScenarioPrediction[],
    createdAt: row.createdAt,
  };
}

/**
 * Pairs raw probabilities with labels for one dimension.
 * Scenarios without a label for that dimension are excluded, not defaulted.
 */
export function labelledPredictionsFor(
  predictions: readonly ScenarioPrediction[],
  dimension: NoulDimension,
): LabelledPrediction[] {
  return predictions.flatMap((prediction) => {
    const expected = prediction.expected?.[dimension];
    if (typeof expected !== "boolean" || !prediction.nouls) return [];
    return [{ probability: prediction.nouls[dimension], expected }];
  });
}

export interface DatasetMetrics {
  dimensions: Array<{ dimension: NoulDimension; metrics: BinaryMetrics | null }>;
  phase: ChoiceAccuracy | null;
  evaluated: number;
  failed: number;
}

export function computeMetrics(
  predictions: readonly ScenarioPrediction[],
  thresholds: Partial<Record<NoulDimension, number>>,
  defaultThreshold: number,
): DatasetMetrics {
  const dimensions = NOUL_DIMENSIONS.map((dimension) => {
    const labelled = labelledPredictionsFor(predictions, dimension);
    return {
      dimension,
      metrics: labelled.length
        ? binaryMetrics(labelled, thresholds[dimension] ?? defaultThreshold)
        : null,
    };
  });

  const phasePairs = predictions.flatMap((prediction) =>
    prediction.expected?.phase && prediction.phase
      ? [{ predicted: prediction.phase, expected: prediction.expected.phase }]
      : [],
  );

  return {
    dimensions,
    phase: phasePairs.length ? choiceAccuracy(phasePairs) : null,
    evaluated: predictions.filter((p) => !p.error).length,
    failed: predictions.filter((p) => p.error).length,
  };
}

/** Round-trips through the import schema, so an export can always be re-imported. */
export function exportDataset(datasetId: string): DatasetInput | null {
  const dataset = getDataset(datasetId);
  if (!dataset) return null;
  return {
    name: dataset.name,
    description: dataset.description,
    scenarios: getScenarios(datasetId).map((scenario) => ({
      name: scenario.name,
      task: scenario.task,
      history: scenario.history,
      currentStep: scenario.currentStep,
      expected: scenario.expected as ExpectedLabels | undefined,
    })),
  };
}
