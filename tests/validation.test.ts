import { describe, expect, it } from "vitest";

import { datasetSchema, expectedLabelsSchema, scenarioSchema } from "@/lib/fixtures/benchmark";
import { BUILT_IN_BENCHMARK } from "@/lib/fixtures/benchmark";
import { DEMO_RUNS } from "@/lib/fixtures/demo-runs";
import { NOUL_DIMENSIONS } from "@/lib/jev/types";
import { perturbationConfigSchema } from "@/lib/perturbations";
import { coerceTimestamp, createRunSchema, LIMITS, traceEventSchema } from "@/lib/trace/types";

describe("traceEventSchema", () => {
  it("accepts a minimal event", () => {
    expect(traceEventSchema.safeParse({ eventType: "shell", content: "npm test" }).success).toBe(
      true,
    );
  });

  it("rejects an unknown event type", () => {
    expect(traceEventSchema.safeParse({ eventType: "explode", content: "x" }).success).toBe(false);
  });

  it("rejects empty content", () => {
    expect(traceEventSchema.safeParse({ eventType: "message", content: "" }).success).toBe(false);
  });

  it("enforces the content size limit", () => {
    const result = traceEventSchema.safeParse({
      eventType: "message",
      content: "x".repeat(LIMITS.content + 1),
    });
    expect(result.success).toBe(false);
  });

  it("enforces the serialized tool payload limit", () => {
    const result = traceEventSchema.safeParse({
      eventType: "tool_call",
      content: "call",
      toolResult: { blob: "x".repeat(LIMITS.toolPayload) },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a tool payload inside the limit", () => {
    expect(
      traceEventSchema.safeParse({
        eventType: "tool_call",
        content: "call",
        toolArguments: { command: "npm test", cwd: "/repo" },
      }).success,
    ).toBe(true);
  });

  it("rejects a non-serializable payload", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      traceEventSchema.safeParse({ eventType: "tool_call", content: "c", toolResult: cyclic })
        .success,
    ).toBe(false);
  });
});

describe("createRunSchema", () => {
  it("requires a name and a task", () => {
    expect(createRunSchema.safeParse({ name: "run" }).success).toBe(false);
    expect(createRunSchema.safeParse({ name: "run", task: "do a thing" }).success).toBe(true);
  });

  it("enforces the task length limit", () => {
    expect(
      createRunSchema.safeParse({ name: "r", task: "x".repeat(LIMITS.task + 1) }).success,
    ).toBe(false);
  });
});

describe("coerceTimestamp", () => {
  it("accepts ISO strings and epoch millis", () => {
    expect(coerceTimestamp("2026-01-02T03:04:05.000Z").toISOString()).toBe(
      "2026-01-02T03:04:05.000Z",
    );
    expect(coerceTimestamp(1_700_000_000_000).getTime()).toBe(1_700_000_000_000);
  });

  it("falls back to now rather than producing an invalid date", () => {
    expect(Number.isNaN(coerceTimestamp("not a date").getTime())).toBe(false);
    expect(Number.isNaN(coerceTimestamp(undefined).getTime())).toBe(false);
  });
});

describe("perturbationConfigSchema", () => {
  it("accepts a bare kind", () => {
    expect(perturbationConfigSchema.safeParse({ kind: "paraphrase" }).success).toBe(true);
  });

  it("rejects an unknown kind and an out-of-range rate", () => {
    expect(perturbationConfigSchema.safeParse({ kind: "nonsense" }).success).toBe(false);
    expect(perturbationConfigSchema.safeParse({ kind: "typoNoise", rate: 5 }).success).toBe(false);
  });
});

describe("dataset schemas", () => {
  it("validates the built-in benchmark", () => {
    const result = datasetSchema.safeParse(BUILT_IN_BENCHMARK);
    expect(result.success).toBe(true);
  });

  it("treats every expected label as optional", () => {
    expect(expectedLabelsSchema.safeParse({}).success).toBe(true);
    expect(expectedLabelsSchema.safeParse({ stuck: true }).success).toBe(true);
    expect(expectedLabelsSchema.safeParse({ phase: "verifying" }).success).toBe(true);
  });

  it("rejects an unknown phase label", () => {
    expect(expectedLabelsSchema.safeParse({ phase: "vibing" }).success).toBe(false);
  });

  it("defaults history to an empty array", () => {
    const parsed = scenarioSchema.parse({
      name: "s",
      task: "t",
      currentStep: { eventType: "message", content: "hello" },
    });
    expect(parsed.history).toEqual([]);
  });
});

describe("built-in fixtures", () => {
  it("ships three demo runs with distinct keys", () => {
    expect(DEMO_RUNS).toHaveLength(3);
    expect(new Set(DEMO_RUNS.map((run) => run.key)).size).toBe(3);
  });

  it("has every demo event satisfy the public ingestion contract", () => {
    for (const run of DEMO_RUNS) {
      for (const { paraphrase: _paraphrase, ...event } of run.events) {
        const result = traceEventSchema.safeParse(event);
        expect(result.success, `${run.key}: ${event.content.slice(0, 40)}`).toBe(true);
      }
    }
  });

  it("hard-codes no judgment values in the demo events", () => {
    // The demos must be evaluated for real; an event carrying a probability
    // would quietly turn the demo into a mock. Checked over the events only —
    // the prose `hypothesis` names dimensions on purpose, and states a
    // prediction to be tested rather than a value to be displayed.
    const banned = [...NOUL_DIMENSIONS, "phase", "phaseProbabilities", "noul", "confidence"];
    for (const run of DEMO_RUNS) {
      const serialized = JSON.stringify(run.events);
      for (const key of banned) {
        expect(serialized, `${run.key} event payload`).not.toContain(`"${key}"`);
      }
    }
  });

  it("labels only what it claims to know", () => {
    const labelled = BUILT_IN_BENCHMARK.scenarios.filter((s) => s.expected);
    expect(labelled.length).toBeGreaterThan(0);
    // A scenario with an `expected` object must actually assert something.
    for (const scenario of labelled) {
      expect(Object.keys(scenario.expected!).length).toBeGreaterThan(0);
    }
  });
});
