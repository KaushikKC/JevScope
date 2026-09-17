/**
 * The one place that calls Jev.
 *
 * Everything else in JevScope — ingestion, perturbations, repeatability,
 * dataset scoring — goes through `evaluateState`, so there is exactly one
 * definition of "a semantic evaluation" and one place where latency is measured
 * and raw responses are captured.
 *
 * Two invariants:
 *  1. Responses are stored unmodified. We parse them into typed fields for the
 *     UI, but `raw` always holds what came back.
 *  2. Failure is non-destructive. A failed evaluation returns `{ok: false}`;
 *     the caller still persists the trace data.
 */
import "server-only";

import type { EntryType } from "@typesafe-ai/sdk";

import { DEFAULT_MODEL, getJevClient } from "./client";
import { mockJudgment } from "./mock";
import { buildQuestions, PHASE_KEY } from "./questions";
import {
  NOUL_DIMENSIONS,
  PHASES,
  type EvaluationOutcome,
  type JevState,
  type NoulDimension,
  type Phase,
} from "./types";

export interface EvaluateOptions {
  model?: string;
  /** Forces the mock generator even when a key exists. Used by nothing but tests. */
  forceMock?: boolean;
}

/**
 * Evaluates one state with all eight questions in a single System One request.
 *
 * They are independent judgments over the same state, so batching them is both
 * correct and far cheaper than eight round trips.
 */
export async function evaluateState(
  state: JevState,
  options: EvaluateOptions = {},
): Promise<EvaluationOutcome> {
  const model = options.model ?? DEFAULT_MODEL;
  const client = options.forceMock ? null : getJevClient();

  if (!client) {
    return { ok: true, ...mockJudgment(state, model) };
  }

  const questions = buildQuestions();
  const startedAt = performance.now();

  try {
    const { data, requestId } = await client
      .systemOne({ state: toEntryState(state), questions, model })
      .withResponse();
    const latencyMs = Math.round(performance.now() - startedAt);

    return {
      ok: true,
      ...parseAnswers(data, latencyMs, requestId),
    };
  } catch (error) {
    return {
      ok: false,
      error: describeError(error),
      latencyMs: Math.round(performance.now() - startedAt),
      model,
    };
  }
}

/**
 * Narrows our state to the JSON value the SDK accepts.
 *
 * The round trip is not ceremony: it drops anything non-serializable before the
 * wire rather than after, so the state we store as "what was sent" and the
 * state actually sent are the same bytes.
 */
function toEntryState(state: JevState): EntryType {
  return JSON.parse(JSON.stringify(state)) as EntryType;
}

type SystemOneLike = {
  model: string;
  answers: Record<string, unknown>;
  usage?: unknown;
};

/**
 * Maps the SDK's typed answers onto our dimensions.
 *
 * A Noul answer is `{type: "noul", noul: number}` — a probability of yes, with
 * no separate confidence. A Choice answer carries `choice`, `probabilities`,
 * and `confidence`, where confidence describes how concentrated the
 * distribution is, not whether the phase is correct.
 */
export function parseAnswers(
  data: SystemOneLike,
  latencyMs: number,
  requestId?: string,
): Omit<Extract<EvaluationOutcome, { ok: true }>, "ok"> {
  const nouls = {} as Record<NoulDimension, number>;
  for (const dimension of NOUL_DIMENSIONS) {
    const answer = data.answers[dimension] as { noul?: number } | undefined;
    if (typeof answer?.noul !== "number") {
      throw new Error(`Missing noul answer for "${dimension}"`);
    }
    nouls[dimension] = answer.noul;
  }

  const phaseAnswer = data.answers[PHASE_KEY] as
    | { choice?: string; confidence?: number; probabilities?: Record<string, number> }
    | undefined;

  if (!phaseAnswer?.choice || !PHASES.includes(phaseAnswer.choice as Phase)) {
    throw new Error(`Missing or unrecognized phase choice: ${String(phaseAnswer?.choice)}`);
  }

  const probabilities = {} as Record<Phase, number>;
  for (const phase of PHASES) {
    probabilities[phase] = phaseAnswer.probabilities?.[phase] ?? 0;
  }

  return {
    nouls,
    phase: phaseAnswer.choice as Phase,
    phaseProbabilities: probabilities,
    phaseConfidence: phaseAnswer.confidence ?? 0,
    latencyMs,
    model: data.model,
    source: "jev",
    requestId,
    raw: data,
  };
}

/**
 * Turns an SDK error into a message safe to show and store.
 * Deliberately does not include headers or request bodies, which can carry
 * credentials.
 */
export function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as { status?: number; name?: string; message?: string };
    if (typeof candidate.status === "number") {
      return `${candidate.name ?? "APIError"} (HTTP ${candidate.status}): ${candidate.message ?? "request failed"}`;
    }
    if (candidate.message) return `${candidate.name ?? "Error"}: ${candidate.message}`;
  }
  return "Evaluation failed for an unknown reason.";
}

export { buildQuestions };
