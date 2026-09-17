/**
 * The agent-trace ingestion contract.
 *
 * These types are the public boundary of JevScope: anything that can emit this
 * shape can be observed. They deliberately know nothing about Jev — semantic
 * evaluation is a separate layer (`lib/jev`) applied to this data.
 *
 * Traces are DATA. Nothing here is ever executed.
 */
import { z } from "zod";

export const EVENT_TYPES = [
  "message",
  "tool_call",
  "tool_result",
  "file_read",
  "file_write",
  "shell",
  "test",
  "completion",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const RUN_STATUSES = ["running", "completed", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Input size limits. Oversized payloads are rejected, not truncated silently. */
export const LIMITS = {
  content: 20_000,
  task: 2_000,
  name: 200,
  systemContext: 8_000,
  /** JSON-serialized length of toolArguments / toolResult. */
  toolPayload: 20_000,
  historyWindow: 10,
} as const;

/** Bounded JSON: arbitrary tool payloads, capped once serialized. */
const boundedJson = z.unknown().superRefine((value, ctx) => {
  if (value === undefined || value === null) return;
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "";
  } catch {
    ctx.addIssue({ code: "custom", message: "value must be JSON-serializable" });
    return;
  }
  if (serialized.length > LIMITS.toolPayload) {
    ctx.addIssue({
      code: "custom",
      message: `serialized payload exceeds ${LIMITS.toolPayload} characters`,
    });
  }
});

export const traceEventSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  content: z.string().min(1).max(LIMITS.content),
  toolName: z.string().max(LIMITS.name).optional(),
  toolArguments: boundedJson.optional(),
  toolResult: boundedJson.optional(),
  /** ISO 8601 or epoch millis. Defaults to ingestion time. */
  timestamp: z.union([z.string().datetime(), z.number().int()]).optional(),
});

export type TraceEventInput = z.infer<typeof traceEventSchema>;

export const createRunSchema = z.object({
  name: z.string().min(1).max(LIMITS.name),
  task: z.string().min(1).max(LIMITS.task),
  systemContext: z.string().max(LIMITS.systemContext).optional(),
  status: z.enum(RUN_STATUSES).optional(),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;

export const updateRunSchema = z.object({
  status: z.enum(RUN_STATUSES).optional(),
  finishedAt: z.union([z.string().datetime(), z.number().int()]).optional(),
});

/** A step as it is handed to the rest of the application. */
export interface TraceStep {
  id: string;
  runId: string;
  index: number;
  eventType: EventType;
  content: string;
  toolName?: string;
  toolArguments?: unknown;
  toolResult?: unknown;
  timestamp: Date;
}

export interface TraceRun {
  id: string;
  name: string;
  task: string;
  systemContext?: string;
  status: RunStatus;
  demoKey?: string;
  startedAt: Date;
  finishedAt?: Date;
}

export function coerceTimestamp(value: string | number | undefined): Date {
  if (value === undefined) return new Date();
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
