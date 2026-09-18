import { describe, expect, it } from "vitest";

import {
  buildState,
  clampText,
  DEFAULT_HISTORY_WINDOW,
  selectHistory,
} from "@/lib/jev/build-state";

const step = (content: string, overrides: Record<string, unknown> = {}) => ({
  eventType: "message" as const,
  content,
  ...overrides,
});

describe("clampText", () => {
  it("leaves short text untouched", () => {
    expect(clampText("hello", 100)).toBe("hello");
  });

  it("keeps both the head and the tail", () => {
    const text = `START${"x".repeat(500)}END`;
    const clamped = clampText(text, 100);
    expect(clamped.startsWith("START")).toBe(true);
    // The tail matters: a test result's verdict lives at the end of the output.
    expect(clamped.endsWith("END")).toBe(true);
    expect(clamped).toContain("characters omitted");
  });
});

describe("selectHistory", () => {
  it("keeps the most recent events within the window", () => {
    const history = Array.from({ length: 12 }, (_, i) => step(`event ${i}`));
    const selected = selectHistory(history, 5);
    expect(selected).toHaveLength(5);
    expect(selected[0].content).toBe("event 7");
    expect(selected[4].content).toBe("event 11");
  });

  it("drops empty events, which carry no signal", () => {
    const selected = selectHistory([step("a"), step("   "), step("b")], 10);
    expect(selected.map((e) => e.content)).toEqual(["a", "b"]);
  });

  it("returns nothing for a zero window", () => {
    expect(selectHistory([step("a")], 0)).toEqual([]);
  });

  it("returns everything when the window exceeds the history", () => {
    expect(selectHistory([step("a"), step("b")], 50)).toHaveLength(2);
  });
});

describe("buildState", () => {
  const input = {
    task: "Add email validation",
    currentStep: step("Running the tests", { eventType: "test" as const, toolName: "shell" }),
    history: Array.from({ length: 12 }, (_, i) => step(`event ${i}`)),
  };

  it("is deterministic: the same input yields identical bytes", () => {
    const a = JSON.stringify(buildState(input));
    const b = JSON.stringify(buildState(input));
    expect(a).toBe(b);
  });

  it("truncates history to the window and says so", () => {
    const state = buildState(input, { historyWindow: 4 });
    expect(state.recentHistory).toHaveLength(4);
    expect(state.historyNote).toContain("8 earlier event(s)");
  });

  it("omits the history note when nothing was dropped", () => {
    const state = buildState({ ...input, history: [step("only one")] }, { historyWindow: 8 });
    expect(state.historyNote).toBeUndefined();
  });

  it("defaults to a window inside the documented range", () => {
    expect(DEFAULT_HISTORY_WINDOW).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_HISTORY_WINDOW).toBeLessThanOrEqual(10);
    expect(buildState(input).recentHistory).toHaveLength(DEFAULT_HISTORY_WINDOW);
  });

  it("numbers steps positionally so a truncated window still shows the position", () => {
    const state = buildState(input, { historyWindow: 3 });
    expect(state.currentStep.stepNumber).toBe(13);
    expect(state.recentHistory.map((e) => e.stepNumber)).toEqual([10, 11, 12]);
  });

  it("carries the tool name and result but never ids or timestamps", () => {
    const state = buildState({
      ...input,
      currentStep: step("Running", {
        eventType: "shell" as const,
        toolName: "shell",
        toolArguments: { command: "npm test" },
        toolResult: "PASS",
      }),
    });
    expect(state.currentStep.tool).toBe("shell");
    expect(state.currentStep.result).toBe("PASS");
    // Ids and timestamps would make identical situations look different.
    expect(JSON.stringify(state)).not.toContain("timestamp");
    expect(JSON.stringify(state)).not.toContain('"id"');
  });

  it("includes systemContext only when supplied", () => {
    expect(buildState(input).systemContext).toBeUndefined();
    expect(buildState({ ...input, systemContext: "Node service" }).systemContext).toBe(
      "Node service",
    );
  });

  it("clamps oversized content", () => {
    const state = buildState(
      { ...input, currentStep: step("x".repeat(9000)) },
      { maxFieldChars: 200 },
    );
    expect(state.currentStep.content.length).toBeLessThanOrEqual(240);
  });
});
