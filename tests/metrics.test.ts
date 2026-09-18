import { describe, expect, it } from "vitest";

import type { NoulDimension, Phase } from "@/lib/jev/types";
import {
  binaryMetrics,
  bestF1Threshold,
  choiceAccuracy,
  percentile,
  thresholdSweep,
} from "@/lib/metrics/classification";
import { aggregateDrift, compareJudgments, totalVariationDistance } from "@/lib/metrics/drift";
import { describe as describeDistribution, describeChoiceStability } from "@/lib/metrics/stats";

const nouls = (overrides: Partial<Record<NoulDimension, number>> = {}) => ({
  taskAlignment: 0.9,
  progress: 0.7,
  repetition: 0.1,
  stuck: 0.08,
  needsVerification: 0.4,
  prematureCompletion: 0.05,
  unexpectedDirection: 0.02,
  ...overrides,
});

const phaseProbabilities = (winner: Phase, weight = 0.7): Record<Phase, number> => {
  const rest = (1 - weight) / 5;
  return {
    exploring: rest,
    implementing: rest,
    verifying: rest,
    recovering: rest,
    finished: rest,
    unclear: rest,
    [winner]: weight,
  } as Record<Phase, number>;
};

const judgment = (overrides: Partial<Record<NoulDimension, number>>, phase: Phase, conf = 0.8) => ({
  nouls: nouls(overrides),
  phase,
  phaseProbabilities: phaseProbabilities(phase),
  phaseConfidence: conf,
  latencyMs: 100,
});

describe("binaryMetrics", () => {
  const predictions = [
    { probability: 0.9, expected: true },
    { probability: 0.8, expected: true },
    { probability: 0.6, expected: false },
    { probability: 0.2, expected: false },
    { probability: 0.1, expected: true },
  ];

  it("counts the confusion matrix at a given threshold", () => {
    const metrics = binaryMetrics(predictions, 0.7);
    expect(metrics.truePositives).toBe(2);
    expect(metrics.falsePositives).toBe(0);
    expect(metrics.trueNegatives).toBe(2);
    expect(metrics.falseNegatives).toBe(1);
  });

  it("computes precision, recall, and F1 from those counts", () => {
    const metrics = binaryMetrics(predictions, 0.5);
    expect(metrics.precision).toBeCloseTo(2 / 3);
    expect(metrics.recall).toBeCloseTo(2 / 3);
    expect(metrics.f1).toBeCloseTo(2 / 3);
  });

  it("thresholds inclusively at the boundary", () => {
    const metrics = binaryMetrics([{ probability: 0.8, expected: true }], 0.8);
    expect(metrics.truePositives).toBe(1);
  });

  it("carries the threshold that produced it", () => {
    expect(binaryMetrics(predictions, 0.42).threshold).toBe(0.42);
  });

  it("returns null, not zero, when a metric is undefined", () => {
    // No positive predictions: precision is undefined, and reporting 0 would
    // wrongly read as "every positive prediction was wrong".
    const metrics = binaryMetrics([{ probability: 0.1, expected: false }], 0.9);
    expect(metrics.precision).toBeNull();
    expect(metrics.recall).toBeNull();
    expect(metrics.f1).toBeNull();
  });

  it("returns null metrics for an empty set", () => {
    const metrics = binaryMetrics([], 0.5);
    expect(metrics.labelled).toBe(0);
    expect(metrics.accuracy).toBeNull();
  });
});

describe("thresholdSweep", () => {
  it("covers the full range inclusively", () => {
    const sweep = thresholdSweep([{ probability: 0.5, expected: true }]);
    expect(sweep).toHaveLength(101);
    expect(sweep[0].threshold).toBe(0);
    expect(sweep[100].threshold).toBe(1);
  });

  it("finds the threshold maximising F1", () => {
    const best = bestF1Threshold([
      { probability: 0.9, expected: true },
      { probability: 0.85, expected: true },
      { probability: 0.2, expected: false },
      { probability: 0.1, expected: false },
    ]);
    expect(best?.f1).toBe(1);
    expect(best!.threshold).toBeGreaterThan(0.2);
    expect(best!.threshold).toBeLessThanOrEqual(0.85);
  });

  it("returns null with nothing to fit", () => {
    expect(bestF1Threshold([])).toBeNull();
  });
});

describe("choiceAccuracy", () => {
  it("counts matches and records the confusions", () => {
    const result = choiceAccuracy([
      { predicted: "verifying", expected: "verifying" },
      { predicted: "implementing", expected: "verifying" },
      { predicted: "exploring", expected: "exploring" },
    ]);
    expect(result.correct).toBe(2);
    expect(result.accuracy).toBeCloseTo(2 / 3);
    expect(result.confusion.find((row) => row.expected !== row.predicted)?.count).toBe(1);
  });
});

describe("percentile", () => {
  it("interpolates between neighbouring samples", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40], 100)).toBe(40);
  });

  it("returns zero for an empty sample", () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe("compareJudgments", () => {
  it("reports per-dimension deltas and the aggregate", () => {
    const comparison = compareJudgments(
      judgment({ stuck: 0.1 }, "implementing"),
      judgment({ stuck: 0.5 }, "implementing"),
    );
    const stuck = comparison.dimensions.find((d) => d.dimension === "stuck")!;
    expect(stuck.delta).toBeCloseTo(0.4);
    expect(comparison.summary.maxDriftDimension).toBe("stuck");
    expect(comparison.summary.choiceFlips).toBe(0);
  });

  it("detects a phase flip", () => {
    const comparison = compareJudgments(
      judgment({}, "implementing"),
      judgment({}, "recovering"),
    );
    expect(comparison.phase.flipped).toBe(true);
    expect(comparison.summary.choiceFlips).toBe(1);
  });

  it("reports zero drift for identical judgments", () => {
    const a = judgment({}, "verifying");
    const comparison = compareJudgments(a, a);
    expect(comparison.summary.meanAbsoluteDrift).toBe(0);
    expect(comparison.summary.maxAbsoluteDrift).toBe(0);
    expect(comparison.summary.phaseDistributionDistance).toBe(0);
  });

  it("counts large shifts against the supplied threshold, not a baked-in one", () => {
    const a = judgment({ stuck: 0.1, repetition: 0.1 }, "implementing");
    const b = judgment({ stuck: 0.25, repetition: 0.25 }, "implementing");
    expect(compareJudgments(a, b, 0.1).summary.largeShifts).toBe(2);
    expect(compareJudgments(a, b, 0.5).summary.largeShifts).toBe(0);
  });
});

describe("totalVariationDistance", () => {
  it("is zero for identical distributions and one for disjoint ones", () => {
    expect(totalVariationDistance([{ original: 0.5, transformed: 0.5 }])).toBe(0);
    expect(
      totalVariationDistance([
        { original: 1, transformed: 0 },
        { original: 0, transformed: 1 },
      ]),
    ).toBe(1);
  });
});

describe("aggregateDrift", () => {
  it("returns null with nothing to aggregate", () => {
    expect(aggregateDrift([])).toBeNull();
  });

  it("sums flips and averages the mean drift", () => {
    const a = compareJudgments(judgment({ stuck: 0.1 }, "implementing"), judgment({ stuck: 0.3 }, "recovering"));
    const b = compareJudgments(judgment({ stuck: 0.1 }, "implementing"), judgment({ stuck: 0.1 }, "implementing"));
    const aggregate = aggregateDrift([a, b])!;
    expect(aggregate.choiceFlips).toBe(1);
    expect(aggregate.meanAbsoluteDrift).toBeCloseTo(
      (a.summary.meanAbsoluteDrift + b.summary.meanAbsoluteDrift) / 2,
    );
  });
});

describe("distributions", () => {
  it("describes a sample with the n-1 standard deviation", () => {
    const distribution = describeDistribution([0.2, 0.4, 0.6]);
    expect(distribution.mean).toBeCloseTo(0.4);
    expect(distribution.median).toBeCloseTo(0.4);
    expect(distribution.range).toBeCloseTo(0.4);
    expect(distribution.standardDeviation).toBeCloseTo(0.2);
  });

  it("reports zero spread for a single sample rather than dividing by zero", () => {
    const distribution = describeDistribution([0.5]);
    expect(distribution.standardDeviation).toBe(0);
    expect(distribution.range).toBe(0);
  });

  it("averages the two middle values for an even count", () => {
    expect(describeDistribution([1, 2, 3, 4]).median).toBe(2.5);
  });

  it("handles an empty sample", () => {
    expect(describeDistribution([]).n).toBe(0);
  });
});

describe("describeChoiceStability", () => {
  it("reports the modal phase and the agreement rate", () => {
    const samples = [
      { phase: "verifying" as Phase, phaseProbabilities: phaseProbabilities("verifying"), phaseConfidence: 0.8 },
      { phase: "verifying" as Phase, phaseProbabilities: phaseProbabilities("verifying"), phaseConfidence: 0.82 },
      { phase: "implementing" as Phase, phaseProbabilities: phaseProbabilities("implementing"), phaseConfidence: 0.6 },
    ];
    const stability = describeChoiceStability(samples);
    expect(stability.modalPhase).toBe("verifying");
    expect(stability.agreement).toBeCloseTo(2 / 3);
    expect(stability.distinctWinners).toBe(2);
    expect(stability.confidence.mean).toBeCloseTo(0.74);
  });

  it("reports full agreement when every repeat picks the same option", () => {
    const sample = {
      phase: "exploring" as Phase,
      phaseProbabilities: phaseProbabilities("exploring"),
      phaseConfidence: 0.9,
    };
    const stability = describeChoiceStability([sample, sample, sample]);
    expect(stability.agreement).toBe(1);
    expect(stability.distinctWinners).toBe(1);
  });
});
