/**
 * Classification metrics against externally supplied labels.
 *
 * These are the ONLY numbers in JevScope that deserve the words precision,
 * recall, or F1, and they exist only where a scenario carries an `expected`
 * label. A probability is not a prediction until a threshold turns it into one,
 * so every result here carries the threshold that produced it.
 */
import type { NoulDimension, Phase } from "@/lib/jev/types";

export interface ConfusionMatrix {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
}

export interface BinaryMetrics extends ConfusionMatrix {
  threshold: number;
  /** Number of labelled scenarios. Metrics over a handful of cases mean little. */
  labelled: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  accuracy: number | null;
}

export interface LabelledPrediction {
  probability: number;
  expected: boolean;
}

/**
 * Applies a threshold and counts outcomes.
 *
 * `precision`, `recall`, and `f1` are null rather than 0 when undefined —
 * "no positive predictions were made" and "every positive prediction was wrong"
 * are different findings, and collapsing them to 0 hides the first.
 */
export function binaryMetrics(
  predictions: readonly LabelledPrediction[],
  threshold: number,
): BinaryMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  for (const { probability, expected } of predictions) {
    const predicted = probability >= threshold;
    if (predicted && expected) truePositives++;
    else if (predicted && !expected) falsePositives++;
    else if (!predicted && !expected) trueNegatives++;
    else falseNegatives++;
  }

  const predictedPositive = truePositives + falsePositives;
  const actualPositive = truePositives + falseNegatives;
  const total = predictions.length;

  const precision = predictedPositive === 0 ? null : truePositives / predictedPositive;
  const recall = actualPositive === 0 ? null : truePositives / actualPositive;
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  return {
    threshold,
    labelled: total,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    f1,
    accuracy: total === 0 ? null : (truePositives + trueNegatives) / total,
  };
}

/** Metrics across a grid of thresholds, for the threshold explorer. */
export function thresholdSweep(
  predictions: readonly LabelledPrediction[],
  steps = 101,
): BinaryMetrics[] {
  return Array.from({ length: steps }, (_, i) =>
    binaryMetrics(predictions, i / (steps - 1)),
  );
}

/**
 * The threshold maximising F1 on this data.
 *
 * Offered as a starting point to inspect, not an answer: it is fitted on the
 * same data it is reported over, and the right operating point depends on what
 * a false positive costs you, which this function cannot know.
 */
export function bestF1Threshold(predictions: readonly LabelledPrediction[]): BinaryMetrics | null {
  const labelled = predictions.length;
  if (labelled === 0) return null;
  const sweep = thresholdSweep(predictions);
  return sweep.reduce((best, current) =>
    (current.f1 ?? -1) > (best.f1 ?? -1) ? current : best,
  );
}

export interface ChoiceAccuracy {
  labelled: number;
  correct: number;
  accuracy: number | null;
  /** Per-label counts: how often `expected` was predicted as each phase. */
  confusion: Array<{ expected: Phase; predicted: Phase; count: number }>;
}

export function choiceAccuracy(
  predictions: ReadonlyArray<{ predicted: Phase; expected: Phase }>,
): ChoiceAccuracy {
  const counts = new Map<string, { expected: Phase; predicted: Phase; count: number }>();
  let correct = 0;

  for (const { predicted, expected } of predictions) {
    if (predicted === expected) correct++;
    const key = `${expected}>${predicted}`;
    const entry = counts.get(key) ?? { expected, predicted, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }

  return {
    labelled: predictions.length,
    correct,
    accuracy: predictions.length === 0 ? null : correct / predictions.length,
    confusion: [...counts.values()].sort((a, b) => b.count - a.count),
  };
}

/** The dimensions a dataset may carry a boolean label for. */
export const LABELLABLE_DIMENSIONS = [
  "taskAlignment",
  "progress",
  "repetition",
  "stuck",
  "needsVerification",
  "prematureCompletion",
  "unexpectedDirection",
] as const satisfies readonly NoulDimension[];

/** Percentile over a sample, used for the dashboard's latency figures. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (rank - lower) * (sorted[upper] - sorted[lower]);
}
