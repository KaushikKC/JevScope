/**
 * Presentation metadata for semantic dimensions.
 *
 * Deliberately no green/red mapping: a high `stuck` probability is a signal to
 * look at, not a failure, and a high `needsVerification` is often exactly right.
 * Valence is carried in words — "generally positive", "worth attention" — while
 * color carries identity only, so a reader is never nudged into treating a
 * probability as a verdict.
 */
import { DIMENSION_LABELS, NOUL_DIMENSIONS, type NoulDimension, type Phase } from "./types";

export interface DimensionPresentation {
  key: NoulDimension;
  label: string;
  short: string;
  /** CSS variable holding this dimension's fixed series color. */
  colorVar: string;
  /** How to read a HIGH probability on this dimension. */
  highMeans: string;
  reading: "generally positive" | "worth attention" | "context-dependent";
}

export const DIMENSION_PRESENTATION: Record<NoulDimension, DimensionPresentation> = {
  taskAlignment: {
    key: "taskAlignment",
    label: DIMENSION_LABELS.taskAlignment,
    short: "Alignment",
    colorVar: "var(--color-series-1)",
    highMeans: "The action contributes directly to the stated task.",
    reading: "generally positive",
  },
  progress: {
    key: "progress",
    label: DIMENSION_LABELS.progress,
    short: "Progress",
    colorVar: "var(--color-series-2)",
    highMeans: "The step moved the work forward rather than leaving it where it was.",
    reading: "generally positive",
  },
  repetition: {
    key: "repetition",
    label: DIMENSION_LABELS.repetition,
    short: "Repetition",
    colorVar: "var(--color-series-3)",
    highMeans: "The step repeats earlier work without the state justifying it.",
    reading: "worth attention",
  },
  stuck: {
    key: "stuck",
    label: DIMENSION_LABELS.stuck,
    short: "Stuck",
    colorVar: "var(--color-series-4)",
    highMeans: "The recent sequence is cycling or failing without progress.",
    reading: "worth attention",
  },
  needsVerification: {
    key: "needsVerification",
    label: DIMENSION_LABELS.needsVerification,
    short: "Needs verif.",
    colorVar: "var(--color-series-5)",
    highMeans: "Nothing in the state yet establishes the work is correct.",
    reading: "context-dependent",
  },
  prematureCompletion: {
    key: "prematureCompletion",
    label: DIMENSION_LABELS.prematureCompletion,
    short: "Premature",
    colorVar: "var(--color-series-6)",
    highMeans: "Claiming completion here would not be supported by the evidence.",
    reading: "worth attention",
  },
  unexpectedDirection: {
    key: "unexpectedDirection",
    label: DIMENSION_LABELS.unexpectedDirection,
    short: "Off-task",
    colorVar: "var(--color-series-7)",
    highMeans: "The agent is doing work the task did not call for.",
    reading: "worth attention",
  },
};

/** The four plotted by default in the semantic timeline. */
export const PRIMARY_DIMENSIONS: NoulDimension[] = [
  "taskAlignment",
  "progress",
  "repetition",
  "stuck",
];

/** Shown as compact rows beneath the main chart. */
export const SECONDARY_DIMENSIONS: NoulDimension[] = [
  "needsVerification",
  "prematureCompletion",
  "unexpectedDirection",
];

export const PHASE_PRESENTATION: Record<Phase, { label: string; color: string }> = {
  exploring: { label: "Exploring", color: "var(--color-series-1)" },
  implementing: { label: "Implementing", color: "var(--color-series-2)" },
  verifying: { label: "Verifying", color: "var(--color-series-3)" },
  recovering: { label: "Recovering", color: "var(--color-series-4)" },
  finished: { label: "Finished", color: "var(--color-series-5)" },
  unclear: { label: "Unclear", color: "var(--color-text-muted)" },
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  message: "MESSAGE",
  tool_call: "TOOL CALL",
  tool_result: "TOOL RESULT",
  file_read: "FILE READ",
  file_write: "FILE WRITE",
  shell: "SHELL",
  test: "TEST",
  completion: "COMPLETION",
};

export { NOUL_DIMENSIONS, DIMENSION_LABELS };
