/**
 * Mock judgment generator for contributors without a TYPESAFE_API_KEY.
 *
 * These numbers are a deterministic hash of the state. They are NOT model
 * output and carry no semantic meaning whatsoever. Every value produced here is
 * tagged `source: "mock"` and the UI labels it as such everywhere it appears —
 * a mock judgment must never be readable as a Jev result.
 *
 * They exist so the interface, charts, and experiment plumbing can be developed
 * and demoed without API credits. Do not benchmark against them.
 */
import { NOUL_DIMENSIONS, PHASES, type NoulDimension, type Phase } from "./types";
import type { JevState, SemanticJudgment } from "./types";

/** FNV-1a. Small, dependency-free, and stable across runs and platforms. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function unitFrom(seed: string): number {
  return hash(seed) / 0x100000000;
}

export function mockJudgment(state: JevState, model: string): SemanticJudgment {
  const key = JSON.stringify(state);

  const nouls = Object.fromEntries(
    NOUL_DIMENSIONS.map((dimension) => [dimension, round(unitFrom(`${dimension}:${key}`))]),
  ) as Record<NoulDimension, number>;

  const weights = PHASES.map((phase) => unitFrom(`phase:${phase}:${key}`) + 0.05);
  const total = weights.reduce((a, b) => a + b, 0);
  const phaseProbabilities = Object.fromEntries(
    PHASES.map((phase, i) => [phase, round(weights[i] / total)]),
  ) as Record<Phase, number>;

  const phase = PHASES.reduce((best, candidate) =>
    phaseProbabilities[candidate] > phaseProbabilities[best] ? candidate : best,
  );

  return {
    nouls,
    phase,
    phaseProbabilities,
    // Mirrors the SDK's shape (concentration of the distribution) but is not
    // TypeSafe's confidence statistic.
    phaseConfidence: round(phaseProbabilities[phase]),
    latencyMs: 0,
    model: `${model} (mock)`,
    source: "mock",
    raw: {
      note: "Mock judgment. Not produced by Jev. Deterministic hash of the state.",
      answers: {
        ...Object.fromEntries(
          NOUL_DIMENSIONS.map((d) => [d, { type: "noul", noul: nouls[d] }]),
        ),
        phase: { type: "choice", choice: phase, confidence: phaseProbabilities[phase], probabilities: phaseProbabilities },
      },
    },
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
