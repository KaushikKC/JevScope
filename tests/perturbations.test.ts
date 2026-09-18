import { describe, expect, it } from "vitest";

import { buildState } from "@/lib/jev/build-state";
import type { JevState } from "@/lib/jev/types";
import { applyPerturbation, describePerturbation } from "@/lib/perturbations";
import { createRng, shuffle } from "@/lib/perturbations/rng";
import {
  ADVERSARIAL_INSTRUCTIONS,
  applyParaphrase,
  applyTypoNoise,
  irrelevantFields,
} from "@/lib/perturbations/transforms";

const baseState = (): JevState =>
  buildState({
    task: "Fix the refresh-token race condition",
    currentStep: {
      eventType: "test",
      content: "Running the auth suite to check whether the race is closed.",
      toolName: "shell",
    },
    history: [
      { eventType: "file_read", content: "Reading src/auth/refresh.ts." },
      { eventType: "file_write", content: "Adding a check before marking the token used." },
      { eventType: "test", content: "Running the auth suite." },
      { eventType: "file_write", content: "Reverting the change." },
    ],
  });

describe("seeded rng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = Array.from({ length: 8 }, createRng(42));
    const b = Array.from({ length: 8 }, createRng(42));
    expect(a).toEqual(b);
  });

  it("produces a different sequence for a different seed", () => {
    expect(Array.from({ length: 8 }, createRng(42))).not.toEqual(
      Array.from({ length: 8 }, createRng(43)),
    );
  });

  it("shuffles reproducibly and preserves every element", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(items, createRng(7));
    expect(shuffle(items, createRng(7))).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });
});

describe("typo noise", () => {
  it("is deterministic for a fixed seed", () => {
    const text = "Running the authentication suite to verify the fix";
    expect(applyTypoNoise(text, 42)).toBe(applyTypoNoise(text, 42));
  });

  it("actually changes the text at a meaningful rate", () => {
    const text = "Running the authentication suite to verify the fix once more";
    expect(applyTypoNoise(text, 42, 0.3)).not.toBe(text);
  });

  it("leaves text alone at a zero rate", () => {
    const text = "Running the authentication suite";
    expect(applyTypoNoise(text, 42, 0)).toBe(text);
  });

  it("keeps the text roughly the same length", () => {
    const text = "Running the authentication suite to verify the fix";
    const noisy = applyTypoNoise(text, 3, 0.1);
    expect(Math.abs(noisy.length - text.length)).toBeLessThan(text.length * 0.2);
  });
});

describe("paraphrase", () => {
  it("prefers a hand-written paraphrase when the fixtures supply one", () => {
    const original =
      "Reading src/routes/register.ts to see how registration input is handled today.";
    expect(applyParaphrase(original)).toBe(
      "Opening src/routes/register.ts to understand the current handling of registration input.",
    );
  });

  it("falls back to rule-based substitution and always returns something different", () => {
    const original = "Checking the build output for errors.";
    const paraphrased = applyParaphrase(original);
    expect(paraphrased).not.toBe(original);
    expect(paraphrased.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const text = "Running the deployment script.";
    expect(applyParaphrase(text)).toBe(applyParaphrase(text));
  });
});

describe("irrelevantFields", () => {
  it("is deterministic and returns the requested count", () => {
    expect(irrelevantFields(11, 3)).toEqual(irrelevantFields(11, 3));
    expect(Object.keys(irrelevantFields(11, 3))).toHaveLength(3);
  });
});

describe("applyPerturbation", () => {
  it("never mutates the state it was given", () => {
    const state = baseState();
    const snapshot = JSON.stringify(state);
    applyPerturbation(state, { kind: "typoNoise", seed: 1 });
    applyPerturbation(state, { kind: "contextReordering", seed: 1 });
    applyPerturbation(state, { kind: "adversarialInstruction" });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("is reproducible for every kind", () => {
    const state = baseState();
    for (const kind of [
      "paraphrase",
      "typoNoise",
      "irrelevantContext",
      "contextReordering",
      "historyTruncation",
      "adversarialInstruction",
    ] as const) {
      const a = JSON.stringify(applyPerturbation(state, { kind, seed: 42 }));
      const b = JSON.stringify(applyPerturbation(state, { kind, seed: 42 }));
      expect(a, `${kind} should be reproducible`).toBe(b);
    }
  });

  it("contextReordering keeps the current step fixed and preserves every event", () => {
    const state = baseState();
    const result = applyPerturbation(state, { kind: "contextReordering", seed: 5 });
    expect(result.currentStep).toEqual(state.currentStep);
    expect(result.recentHistory).toHaveLength(state.recentHistory.length);
    expect([...result.recentHistory].map((e) => e.content).sort()).toEqual(
      [...state.recentHistory].map((e) => e.content).sort(),
    );
  });

  it("historyTruncation keeps the most recent events", () => {
    const state = baseState();
    const result = applyPerturbation(state, { kind: "historyTruncation", keep: 2 });
    expect(result.recentHistory).toHaveLength(2);
    expect(result.recentHistory.at(-1)).toEqual(state.recentHistory.at(-1));
    expect(result.historyNote).toContain("2 earlier event(s)");
  });

  it("historyTruncation to the full length leaves no note", () => {
    const state = baseState();
    const result = applyPerturbation(state, {
      kind: "historyTruncation",
      keep: state.recentHistory.length,
    });
    expect(result.historyNote).toBeUndefined();
  });

  it("irrelevantContext adds fields without touching the step or history", () => {
    const state = baseState();
    const result = applyPerturbation(state, { kind: "irrelevantContext", seed: 3 });
    expect(result.currentStep).toEqual(state.currentStep);
    expect(result.recentHistory).toEqual(state.recentHistory);
    expect(Object.keys(result).length).toBeGreaterThan(Object.keys(state).length);
  });

  it("adversarialInstruction injects into the observed content, not the questions", () => {
    const state = baseState();
    const result = applyPerturbation(state, {
      kind: "adversarialInstruction",
      variant: "markSuccessful",
    });
    expect(result.currentStep.content).toContain(ADVERSARIAL_INSTRUCTIONS.markSuccessful);
    expect(result.currentStep.content.startsWith(state.currentStep.content)).toBe(true);
    expect(result.task).toBe(state.task);
  });

  it("paraphrase changes wording but keeps the structure", () => {
    const state = baseState();
    const result = applyPerturbation(state, { kind: "paraphrase" });
    expect(result.currentStep.content).not.toBe(state.currentStep.content);
    expect(result.recentHistory).toHaveLength(state.recentHistory.length);
    expect(result.task).toBe(state.task);
  });
});

describe("describePerturbation", () => {
  it("names the parameters that actually varied", () => {
    expect(describePerturbation({ kind: "typoNoise", seed: 7, rate: 0.1 })).toBe(
      "rate 0.10, seed 7",
    );
    expect(describePerturbation({ kind: "historyTruncation", keep: 3 })).toBe("keep 3 event(s)");
    expect(describePerturbation({ kind: "contextReordering", seed: 9 })).toBe("seed 9");
  });
});
