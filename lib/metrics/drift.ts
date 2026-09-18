/**
 * Comparing two judgments over the same moment.
 *
 * Everything here is a *derived* quantity: it describes how far two model
 * outputs sit from each other. None of it is accuracy, and none of it says
 * which of the two is right — there is no label in this file.
 */
import { NOUL_DIMENSIONS, PHASES, type NoulDimension, type Phase } from "@/lib/jev/types";

export interface JudgmentLike {
  nouls: Record<NoulDimension, number>;
  phase: Phase;
  phaseProbabilities: Record<Phase, number>;
  phaseConfidence: number;
  latencyMs: number;
}

export interface DimensionDrift {
  dimension: NoulDimension;
  original: number;
  transformed: number;
  delta: number;
  absoluteDelta: number;
}

export interface DriftComparison {
  dimensions: DimensionDrift[];
  phase: {
    original: Phase;
    transformed: Phase;
    flipped: boolean;
    originalConfidence: number;
    transformedConfidence: number;
    confidenceDelta: number;
    /** Per-option probability movement, not just the winner. */
    probabilityDrift: Array<{ phase: Phase; original: number; transformed: number; delta: number }>;
  };
  summary: DriftSummary;
}

export interface DriftSummary {
  meanAbsoluteDrift: number;
  maxAbsoluteDrift: number;
  maxDriftDimension: NoulDimension | null;
  /** Count of Noul dimensions moving more than `largeShiftThreshold`. */
  largeShifts: number;
  largeShiftThreshold: number;
  choiceFlips: number;
  /** Total variation distance between the two phase distributions. */
  phaseDistributionDistance: number;
  latencyDeltaMs: number;
}

/**
 * What counts as a "large" shift is a display choice, not a fact about the
 * model, so it is a parameter with a visible default rather than a constant
 * buried in the comparison.
 */
export const DEFAULT_LARGE_SHIFT_THRESHOLD = 0.1;

export function compareJudgments(
  original: JudgmentLike,
  transformed: JudgmentLike,
  largeShiftThreshold = DEFAULT_LARGE_SHIFT_THRESHOLD,
): DriftComparison {
  const dimensions: DimensionDrift[] = NOUL_DIMENSIONS.map((dimension) => {
    const a = original.nouls[dimension];
    const b = transformed.nouls[dimension];
    return {
      dimension,
      original: a,
      transformed: b,
      delta: b - a,
      absoluteDelta: Math.abs(b - a),
    };
  });

  const absolutes = dimensions.map((d) => d.absoluteDelta);
  const maxAbsolute = absolutes.length ? Math.max(...absolutes) : 0;
  const maxDimension = dimensions.find((d) => d.absoluteDelta === maxAbsolute)?.dimension ?? null;

  const probabilityDrift = PHASES.map((phase) => {
    const a = original.phaseProbabilities[phase] ?? 0;
    const b = transformed.phaseProbabilities[phase] ?? 0;
    return { phase, original: a, transformed: b, delta: b - a };
  });

  const flipped = original.phase !== transformed.phase;

  return {
    dimensions,
    phase: {
      original: original.phase,
      transformed: transformed.phase,
      flipped,
      originalConfidence: original.phaseConfidence,
      transformedConfidence: transformed.phaseConfidence,
      confidenceDelta: transformed.phaseConfidence - original.phaseConfidence,
      probabilityDrift,
    },
    summary: {
      meanAbsoluteDrift: absolutes.length
        ? absolutes.reduce((a, b) => a + b, 0) / absolutes.length
        : 0,
      maxAbsoluteDrift: maxAbsolute,
      maxDriftDimension: maxDimension,
      largeShifts: absolutes.filter((value) => value > largeShiftThreshold).length,
      largeShiftThreshold,
      choiceFlips: flipped ? 1 : 0,
      phaseDistributionDistance: totalVariationDistance(probabilityDrift),
      latencyDeltaMs: transformed.latencyMs - original.latencyMs,
    },
  };
}

/**
 * Total variation distance: half the L1 distance between the distributions.
 * Ranges 0 (identical) to 1 (disjoint), and unlike a flip count it registers
 * movement that did not change the winner.
 */
export function totalVariationDistance(
  drift: ReadonlyArray<{ original: number; transformed: number }>,
): number {
  const sum = drift.reduce((acc, d) => acc + Math.abs(d.transformed - d.original), 0);
  return sum / 2;
}

/** Aggregates several comparisons, e.g. every perturbation applied to one step. */
export function aggregateDrift(
  comparisons: ReadonlyArray<{ summary: DriftSummary }>,
): DriftSummary | null {
  if (comparisons.length === 0) return null;
  const summaries = comparisons.map((c) => c.summary);
  return {
    meanAbsoluteDrift:
      summaries.reduce((a, s) => a + s.meanAbsoluteDrift, 0) / summaries.length,
    maxAbsoluteDrift: Math.max(...summaries.map((s) => s.maxAbsoluteDrift)),
    maxDriftDimension:
      summaries.reduce((best, s) =>
        s.maxAbsoluteDrift > best.maxAbsoluteDrift ? s : best,
      ).maxDriftDimension,
    largeShifts: summaries.reduce((a, s) => a + s.largeShifts, 0),
    largeShiftThreshold: summaries[0].largeShiftThreshold,
    choiceFlips: summaries.reduce((a, s) => a + s.choiceFlips, 0),
    phaseDistributionDistance:
      summaries.reduce((a, s) => a + s.phaseDistributionDistance, 0) / summaries.length,
    latencyDeltaMs: Math.round(
      summaries.reduce((a, s) => a + s.latencyDeltaMs, 0) / summaries.length,
    ),
  };
}
