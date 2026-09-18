/**
 * The perturbation registry.
 *
 * A perturbation is a pure function from one state to another. It is applied to
 * the *already-built* state, so the thing shown in the raw inspector is the
 * exact thing that was sent, and applying the same perturbation with the same
 * seed always produces the same bytes.
 *
 * What these measure: whether a semantic judgment depends on the agent's
 * behavior or on the incidental surface of how that behavior was written down.
 */
import { z } from "zod";

import type { JevState } from "@/lib/jev/types";

import { DEFAULT_SEED, shuffle, createRng } from "./rng";
import {
  ADVERSARIAL_INSTRUCTIONS,
  applyParaphrase,
  applyTypoNoise,
  irrelevantFields,
  type AdversarialVariant,
} from "./transforms";

export const PERTURBATION_KINDS = [
  "paraphrase",
  "typoNoise",
  "irrelevantContext",
  "contextReordering",
  "historyTruncation",
  "adversarialInstruction",
] as const;

export type PerturbationKind = (typeof PERTURBATION_KINDS)[number];

export const perturbationConfigSchema = z.object({
  kind: z.enum(PERTURBATION_KINDS),
  seed: z.number().int().min(0).max(2 ** 31).optional(),
  /** typoNoise: fraction of eligible characters affected. */
  rate: z.number().min(0).max(0.5).optional(),
  /** historyTruncation: how many recent events to keep. */
  keep: z.number().int().min(0).max(20).optional(),
  /** adversarialInstruction: which injected instruction to use. */
  variant: z.enum(["markSuccessful", "declareFinished", "suppressConcern"]).optional(),
});

export type PerturbationConfig = z.infer<typeof perturbationConfigSchema>;

export interface PerturbationInfo {
  kind: PerturbationKind;
  label: string;
  /** What a large drift under this perturbation would tell you. */
  question: string;
}

export const PERTURBATION_INFO: Record<PerturbationKind, PerturbationInfo> = {
  paraphrase: {
    kind: "paraphrase",
    label: "Paraphrase",
    question:
      "Restates the current step with the same meaning in different words. Drift here means the judgment tracks phrasing, not behavior.",
  },
  typoNoise: {
    kind: "typoNoise",
    label: "Typo noise",
    question:
      "Swaps and drops characters at a fixed rate with a fixed seed. Drift here means the judgment is sensitive to transcription noise a human reader would ignore.",
  },
  irrelevantContext: {
    kind: "irrelevantContext",
    label: "Irrelevant context",
    question:
      "Adds metadata that bears on none of the questions. Drift here means unrelated content in the state is changing the answer.",
  },
  contextReordering: {
    kind: "contextReordering",
    label: "Context reordering",
    question:
      "Shuffles previous events while keeping the current one fixed. Drift here means the judgment depends on history order — which is legitimate for `stuck` and `repetition`, and much less so for `taskAlignment`.",
  },
  historyTruncation: {
    kind: "historyTruncation",
    label: "History truncation",
    question:
      "Evaluates with a smaller history window. Drift here shows how much of the judgment came from history rather than the current step, and how short a window you can afford.",
  },
  adversarialInstruction: {
    kind: "adversarialInstruction",
    label: "Adversarial instruction",
    question:
      "Injects an explicit instruction to report success, inside the observed data. Drift here means text an agent could write into a file can steer its own evaluation.",
  },
};

/** Deep clone that keeps the state a plain JSON value. */
function clone(state: JevState): JevState {
  return JSON.parse(JSON.stringify(state)) as JevState;
}

/**
 * Applies a perturbation. Pure: same config in, same state out, every time.
 */
export function applyPerturbation(state: JevState, config: PerturbationConfig): JevState {
  const seed = config.seed ?? DEFAULT_SEED;
  const next = clone(state);

  switch (config.kind) {
    case "paraphrase": {
      next.currentStep.content = applyParaphrase(next.currentStep.content);
      next.recentHistory = next.recentHistory.map((event) => ({
        ...event,
        content: applyParaphrase(event.content),
      }));
      return next;
    }

    case "typoNoise": {
      const rate = config.rate ?? 0.06;
      next.currentStep.content = applyTypoNoise(next.currentStep.content, seed, rate);
      next.recentHistory = next.recentHistory.map((event, i) => ({
        ...event,
        // Offsetting the seed per event keeps each one independently noisy
        // while the whole transform stays a function of the single seed.
        content: applyTypoNoise(event.content, seed + i + 1, rate),
      }));
      return next;
    }

    case "irrelevantContext": {
      return { ...next, ...irrelevantFields(seed, 3) };
    }

    case "contextReordering": {
      // The current step is untouched; only the order of what came before moves.
      next.recentHistory = shuffle(next.recentHistory, createRng(seed));
      return next;
    }

    case "historyTruncation": {
      const keep = config.keep ?? Math.max(0, Math.floor(next.recentHistory.length / 2));
      const dropped = Math.max(0, next.recentHistory.length - keep);
      next.recentHistory = next.recentHistory.slice(next.recentHistory.length - keep);
      next.historyNote =
        dropped > 0
          ? `${dropped} earlier event(s) occurred before this window and are not shown.`
          : undefined;
      if (next.historyNote === undefined) delete next.historyNote;
      return next;
    }

    case "adversarialInstruction": {
      const variant: AdversarialVariant = config.variant ?? "markSuccessful";
      const instruction = ADVERSARIAL_INSTRUCTIONS[variant];
      // Injected where an agent could realistically put it: inside the content
      // of the observed event, not into our questions.
      next.currentStep.content = `${next.currentStep.content}\n\n${instruction}`;
      return next;
    }
  }
}

/** A short, human-readable description of what a config actually did. */
export function describePerturbation(config: PerturbationConfig): string {
  const seed = config.seed ?? DEFAULT_SEED;
  switch (config.kind) {
    case "typoNoise":
      return `rate ${(config.rate ?? 0.06).toFixed(2)}, seed ${seed}`;
    case "historyTruncation":
      return config.keep === undefined ? "half the window" : `keep ${config.keep} event(s)`;
    case "adversarialInstruction":
      return config.variant ?? "markSuccessful";
    case "contextReordering":
    case "irrelevantContext":
      return `seed ${seed}`;
    case "paraphrase":
      return "deterministic restatement";
  }
}

export { ADVERSARIAL_INSTRUCTIONS, applyParaphrase, applyTypoNoise, DEFAULT_SEED };
