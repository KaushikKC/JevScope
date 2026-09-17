/**
 * Deterministic state construction.
 *
 * Given the same inputs this returns byte-identical state, which is what makes
 * perturbation and repeatability experiments meaningful: when a judgment moves,
 * we know the state is not what moved.
 *
 * It is a pure function with no I/O so it can be unit-tested and benchmarked
 * directly, and so the exact object shown in the raw inspector is the exact
 * object that was sent.
 */
import type { TraceEventInput, TraceStep } from "@/lib/trace/types";
import { LIMITS } from "@/lib/trace/types";

import type { JevState } from "./types";

export interface BuildStateOptions {
  /** How many previous events to include. Default 8 (inside the 5-10 guidance). */
  historyWindow?: number;
  /** Cap on a single content field inside the state, in characters. */
  maxFieldChars?: number;
}

export const DEFAULT_HISTORY_WINDOW = 8;
export const DEFAULT_MAX_FIELD_CHARS = 1_500;

/** Anything the agent read or produced that carries no semantic signal. */
const NOISE_EVENT_CONTENT = /^\s*$/;

/**
 * Truncates in the middle rather than the end: the tail of a test run or a
 * stack trace usually carries the outcome, so keeping only the head would
 * systematically hide failures from the evaluator.
 */
export function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const head = Math.ceil((maxChars - 20) * 0.6);
  const tail = Math.floor((maxChars - 20) * 0.4);
  return `${value.slice(0, head)}\n…[${value.length - head - tail} characters omitted]…\n${value.slice(value.length - tail)}`;
}

function clampUnknown(value: unknown, maxChars: number): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return clampText(value, maxChars);
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "";
  } catch {
    return "[unserializable]";
  }
  if (serialized.length <= maxChars) return value;
  return clampText(serialized, maxChars);
}

/**
 * Selects the previous events worth sending.
 *
 * "Useful" means: carries content, and is not a bare tool_call whose paired
 * tool_result is also in the window (the result subsumes it). We keep the most
 * recent `historyWindow` such events, in chronological order.
 */
export function selectHistory<T extends { eventType: string; content: string }>(
  history: readonly T[],
  historyWindow: number,
): T[] {
  if (historyWindow <= 0) return [];
  const useful = history.filter((event) => !NOISE_EVENT_CONTENT.test(event.content));
  return useful.slice(Math.max(0, useful.length - historyWindow));
}

type StepLike = Pick<
  TraceStep,
  "eventType" | "content" | "toolName" | "toolArguments" | "toolResult"
> & { index?: number };

function toEventSummary(event: StepLike, stepNumber: number, maxFieldChars: number) {
  return {
    stepNumber,
    type: event.eventType,
    content: clampText(event.content, maxFieldChars),
    ...(event.toolName ? { tool: event.toolName } : {}),
    ...(event.toolResult !== undefined && event.toolResult !== null
      ? { result: clampUnknown(event.toolResult, maxFieldChars) }
      : {}),
  };
}

export interface BuildStateInput {
  task: string;
  systemContext?: string | null;
  currentStep: StepLike;
  /** Chronological, oldest first. Only events BEFORE currentStep. */
  history: readonly StepLike[];
}

/**
 * Builds the state object sent to Jev.
 *
 * Note what is deliberately absent: timestamps, ids, and run metadata. They
 * would make otherwise identical situations look different to the model and
 * add nothing to any of the seven judgments.
 */
export function buildState(input: BuildStateInput, options: BuildStateOptions = {}): JevState {
  const historyWindow = options.historyWindow ?? DEFAULT_HISTORY_WINDOW;
  const maxFieldChars = options.maxFieldChars ?? DEFAULT_MAX_FIELD_CHARS;

  const selected = selectHistory(input.history, historyWindow);
  const dropped = input.history.length - selected.length;

  // Step numbers are positional within the supplied trace, so a truncated
  // window still shows the model that earlier events existed.
  const baseIndex = input.currentStep.index ?? input.history.length;
  const firstSelectedNumber = baseIndex - selected.length + 1;

  const state: JevState = {
    task: input.task,
    currentStep: {
      stepNumber: baseIndex + 1,
      type: input.currentStep.eventType,
      content: clampText(input.currentStep.content, maxFieldChars),
      ...(input.currentStep.toolName ? { tool: input.currentStep.toolName } : {}),
      ...(input.currentStep.toolArguments !== undefined && input.currentStep.toolArguments !== null
        ? { arguments: clampUnknown(input.currentStep.toolArguments, maxFieldChars) }
        : {}),
      ...(input.currentStep.toolResult !== undefined && input.currentStep.toolResult !== null
        ? { result: clampUnknown(input.currentStep.toolResult, maxFieldChars) }
        : {}),
    },
    recentHistory: selected.map((event, i) =>
      toEventSummary(event, firstSelectedNumber + i, maxFieldChars),
    ),
  };

  if (input.systemContext) {
    state.systemContext = clampText(input.systemContext, maxFieldChars);
  }

  if (dropped > 0) {
    state.historyNote = `${dropped} earlier event(s) occurred before this window and are not shown.`;
  }

  return state;
}

/** Convenience wrapper for dataset scenarios, which carry raw event inputs. */
export function buildStateFromScenario(
  scenario: { task: string; history: TraceEventInput[]; currentStep: TraceEventInput },
  options?: BuildStateOptions,
): JevState {
  return buildState(
    {
      task: scenario.task,
      currentStep: { ...scenario.currentStep, index: scenario.history.length },
      history: scenario.history,
    },
    options,
  );
}

export const HISTORY_WINDOW_BOUNDS = { min: 0, max: LIMITS.historyWindow } as const;
