/**
 * Descriptive statistics for the repeatability experiment.
 *
 * These describe the spread of a model's own output across identical requests.
 * A wide spread is a property of the model on this input; it is not an error
 * rate, because nothing here knows the right answer.
 */
import { PHASES, type NoulDimension, type Phase } from "@/lib/jev/types";

export interface Distribution {
  n: number;
  values: number[];
  mean: number;
  /** Sample standard deviation (n-1). Zero when n < 2. */
  standardDeviation: number;
  min: number;
  max: number;
  range: number;
  median: number;
}

export function describe(values: readonly number[]): Distribution {
  const n = values.length;
  if (n === 0) {
    return { n: 0, values: [], mean: 0, standardDeviation: 0, min: 0, max: 0, range: 0, median: 0 };
  }
  const list = [...values];
  const sorted = [...list].sort((a, b) => a - b);
  const mean = list.reduce((a, b) => a + b, 0) / n;
  // n-1: these are samples of the model's output, not the whole population.
  const variance =
    n < 2 ? 0 : list.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (n - 1);
  const min = sorted[0];
  const max = sorted[n - 1];

  return {
    n,
    values: list,
    mean,
    standardDeviation: Math.sqrt(variance),
    min,
    max,
    range: max - min,
    median:
      n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
  };
}

export interface ChoiceStability {
  /** How often each phase won, across the repeats. */
  wins: Record<Phase, number>;
  /** The most frequent winner. */
  modalPhase: Phase;
  /** Fraction of repeats that agreed with the modal phase, 0-1. */
  agreement: number;
  /** Spread of each option's probability across repeats. */
  probabilityDistributions: Record<Phase, Distribution>;
  confidence: Distribution;
  distinctWinners: number;
}

export function describeChoiceStability(
  samples: ReadonlyArray<{
    phase: Phase;
    phaseProbabilities: Record<Phase, number>;
    phaseConfidence: number;
  }>,
): ChoiceStability {
  const wins = Object.fromEntries(PHASES.map((phase) => [phase, 0])) as Record<Phase, number>;
  for (const sample of samples) wins[sample.phase] += 1;

  const modalPhase = PHASES.reduce((best, candidate) =>
    wins[candidate] > wins[best] ? candidate : best,
  );

  const probabilityDistributions = Object.fromEntries(
    PHASES.map((phase) => [
      phase,
      describe(samples.map((sample) => sample.phaseProbabilities[phase] ?? 0)),
    ]),
  ) as Record<Phase, Distribution>;

  return {
    wins,
    modalPhase,
    agreement: samples.length ? wins[modalPhase] / samples.length : 0,
    probabilityDistributions,
    confidence: describe(samples.map((sample) => sample.phaseConfidence)),
    distinctWinners: PHASES.filter((phase) => wins[phase] > 0).length,
  };
}

export interface RepeatabilityReport {
  repeats: number;
  nouls: Record<NoulDimension, Distribution>;
  choice: ChoiceStability;
  latencyMs: Distribution;
}
