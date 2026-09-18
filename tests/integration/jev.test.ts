import { describe, expect, it } from "vitest";

import { buildStateFromScenario } from "@/lib/jev/build-state";
import { evaluateState } from "@/lib/jev/evaluate-step";
import { NOUL_DIMENSIONS, PHASES } from "@/lib/jev/types";
import { applyPerturbation } from "@/lib/perturbations";
import { compareJudgments } from "@/lib/metrics/drift";

/**
 * Real System One requests. These spend credit, so the whole file skips itself
 * unless TYPESAFE_API_KEY is present and you opt in with
 * `npm run test:integration`.
 *
 * What they check is the contract, not the answers: that the SDK shape we build
 * against is the shape we get, that probabilities are in range, and that the
 * perturbation path produces a comparable judgment. They deliberately do NOT
 * assert that a given step scores above some value — that would encode an
 * expectation about the model as a pass condition, and the model is the thing
 * under observation.
 */
const hasKey = Boolean(process.env.TYPESAFE_API_KEY?.trim());
const suite = hasKey ? describe : describe.skip;

if (!hasKey) {
  console.warn("[integration] TYPESAFE_API_KEY not set — skipping live Jev tests.");
}

const scenario = {
  task: "Fix the failing authentication tests.",
  history: [
    { eventType: "test" as const, content: "Running the auth suite.", toolResult: "FAIL: 3 failed, 9 passed" },
    { eventType: "file_write" as const, content: "Correcting the expiry comparison in session.ts." },
    { eventType: "test" as const, content: "Running the auth suite.", toolResult: "FAIL: 2 failed, 10 passed" },
  ],
  currentStep: {
    eventType: "completion" as const,
    content: "Fixed the authentication tests. The auth suite is in good shape now.",
  },
};

suite("live Jev evaluation", () => {
  it("returns a complete, well-formed judgment", async () => {
    const outcome = await evaluateState(buildStateFromScenario(scenario));

    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.source).toBe("jev");
    expect(outcome.model).toMatch(/^jev/);
    expect(outcome.latencyMs).toBeGreaterThan(0);

    for (const dimension of NOUL_DIMENSIONS) {
      const value = outcome.nouls[dimension];
      expect(value, dimension).toBeGreaterThanOrEqual(0);
      expect(value, dimension).toBeLessThanOrEqual(1);
    }

    expect(PHASES).toContain(outcome.phase);
    expect(outcome.phaseConfidence).toBeGreaterThanOrEqual(0);
    expect(outcome.phaseConfidence).toBeLessThanOrEqual(1);

    // The Choice distribution should cover the options and sum to about one.
    const total = PHASES.reduce((sum, phase) => sum + outcome.phaseProbabilities[phase], 0);
    expect(total).toBeCloseTo(1, 1);

    // The raw body is kept for reproducibility.
    expect(outcome.raw).toBeTruthy();
  });

  it("evaluates a perturbed state and yields a comparable judgment", async () => {
    const original = buildStateFromScenario(scenario);
    const perturbed = applyPerturbation(original, { kind: "typoNoise", seed: 42, rate: 0.06 });

    const [a, b] = await Promise.all([evaluateState(original), evaluateState(perturbed)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const comparison = compareJudgments(a, b);
    expect(comparison.dimensions).toHaveLength(NOUL_DIMENSIONS.length);
    expect(comparison.summary.meanAbsoluteDrift).toBeGreaterThanOrEqual(0);
    expect(comparison.summary.meanAbsoluteDrift).toBeLessThanOrEqual(1);

    // Reported, not asserted: the size of this drift is a finding, not a
    // pass condition.
    console.info(
      `[integration] typo-noise drift: mean ${comparison.summary.meanAbsoluteDrift.toFixed(3)}, ` +
        `max ${comparison.summary.maxAbsoluteDrift.toFixed(3)}, ` +
        `phase ${comparison.phase.original} → ${comparison.phase.transformed}`,
    );
  });
});
