import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NOUL_DIMENSIONS, PHASES } from "@/lib/jev/types";

/**
 * The TypeSafe boundary is mocked here. These tests assert how JevScope parses
 * and fails, not how Jev answers — so they cost nothing and never need a key.
 */
const systemOne = vi.fn();

vi.mock("@typesafe-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@typesafe-ai/sdk")>();
  return {
    ...actual,
    TypeSafeClient: class {
      systemOne = systemOne;
    },
  };
});

function answerFixture(overrides: Record<string, unknown> = {}) {
  return {
    model: "jev-1.13.0",
    usage: { input_tokens: 800, output_tokens: 8 },
    answers: {
      ...Object.fromEntries(
        NOUL_DIMENSIONS.map((dimension, i) => [
          dimension,
          { type: "noul", noul: 0.1 * (i + 1) },
        ]),
      ),
      phase: {
        type: "choice",
        choice: "implementing",
        confidence: 0.84,
        probabilities: Object.fromEntries(
          PHASES.map((phase) => [phase, phase === "implementing" ? 0.7 : 0.06]),
        ),
      },
      ...overrides,
    },
  };
}

/** Mirrors the SDK's APIPromise: awaitable, with `.withResponse()`. */
function apiPromise(value: unknown) {
  const promise = Promise.resolve(value) as Promise<unknown> & {
    withResponse: () => Promise<unknown>;
  };
  promise.withResponse = () => Promise.resolve({ data: value, requestId: "req_test_123" });
  return promise;
}

const state = {
  task: "Add validation",
  currentStep: { stepNumber: 1, type: "test", content: "npm test" },
  recentHistory: [],
};

describe("parseAnswers", () => {
  it("maps every dimension and the phase choice", async () => {
    const { parseAnswers } = await import("@/lib/jev/evaluate-step");
    const parsed = parseAnswers(answerFixture(), 120, "req_1");

    expect(Object.keys(parsed.nouls).sort()).toEqual([...NOUL_DIMENSIONS].sort());
    expect(parsed.nouls.taskAlignment).toBeCloseTo(0.1);
    expect(parsed.phase).toBe("implementing");
    expect(parsed.phaseConfidence).toBeCloseTo(0.84);
    expect(parsed.latencyMs).toBe(120);
    expect(parsed.source).toBe("jev");
    expect(parsed.requestId).toBe("req_1");
  });

  it("stores the response unmodified", async () => {
    const { parseAnswers } = await import("@/lib/jev/evaluate-step");
    const fixture = answerFixture();
    expect(parseAnswers(fixture, 1).raw).toBe(fixture);
  });

  it("fills a missing phase option with zero rather than dropping it", async () => {
    const { parseAnswers } = await import("@/lib/jev/evaluate-step");
    const parsed = parseAnswers(
      answerFixture({
        phase: {
          type: "choice",
          choice: "verifying",
          confidence: 0.5,
          probabilities: { verifying: 1 },
        },
      }),
      1,
    );
    expect(Object.keys(parsed.phaseProbabilities).sort()).toEqual([...PHASES].sort());
    expect(parsed.phaseProbabilities.exploring).toBe(0);
  });

  it("throws on a missing noul rather than substituting a value", async () => {
    const { parseAnswers } = await import("@/lib/jev/evaluate-step");
    const broken = answerFixture();
    delete (broken.answers as Record<string, unknown>).stuck;
    expect(() => parseAnswers(broken, 1)).toThrow(/stuck/);
  });

  it("throws on an unrecognized phase", async () => {
    const { parseAnswers } = await import("@/lib/jev/evaluate-step");
    expect(() =>
      parseAnswers(
        answerFixture({
          phase: { type: "choice", choice: "napping", confidence: 1, probabilities: {} },
        }),
        1,
      ),
    ).toThrow(/phase/i);
  });
});

describe("describeError", () => {
  it("summarises an API error without leaking headers or bodies", async () => {
    const { describeError } = await import("@/lib/jev/evaluate-step");
    const message = describeError(
      Object.assign(new Error("rate limited"), {
        name: "RateLimitError",
        status: 429,
        headers: new Headers({ authorization: "Bearer secret" }),
      }),
    );
    expect(message).toContain("429");
    expect(message).toContain("RateLimitError");
    expect(message).not.toContain("secret");
  });

  it("handles an unknown throw", async () => {
    const { describeError } = await import("@/lib/jev/evaluate-step");
    expect(describeError("boom")).toBe("Evaluation failed for an unknown reason.");
  });
});

describe("evaluateState", () => {
  beforeEach(() => {
    vi.resetModules();
    systemOne.mockReset();
    process.env.TYPESAFE_API_KEY = "test-key-not-real";
  });

  afterEach(() => {
    delete process.env.TYPESAFE_API_KEY;
  });

  it("sends one request carrying all eight questions", async () => {
    systemOne.mockReturnValue(apiPromise(answerFixture()));
    const { evaluateState } = await import("@/lib/jev/evaluate-step");

    const outcome = await evaluateState(state);

    expect(systemOne).toHaveBeenCalledTimes(1);
    const request = systemOne.mock.calls[0][0];
    expect(Object.keys(request.questions)).toHaveLength(NOUL_DIMENSIONS.length + 1);
    expect(request.questions.phase.type).toBe("choice");
    expect(request.questions.stuck.type).toBe("noul");
    expect(outcome.ok).toBe(true);
  });

  it("returns a failure outcome instead of throwing", async () => {
    systemOne.mockImplementation(() => {
      const promise = Promise.reject(
        Object.assign(new Error("upstream down"), { name: "InternalServerError", status: 500 }),
      );
      return Object.assign(promise, { withResponse: () => promise });
    });
    const { evaluateState } = await import("@/lib/jev/evaluate-step");

    const outcome = await evaluateState(state);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("500");
      expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("falls back to mock judgments when no key is set, and labels them", async () => {
    delete process.env.TYPESAFE_API_KEY;
    vi.resetModules();
    const { evaluateState } = await import("@/lib/jev/evaluate-step");

    const outcome = await evaluateState(state);

    expect(systemOne).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.source).toBe("mock");
      expect(outcome.model).toContain("mock");
      for (const dimension of NOUL_DIMENSIONS) {
        expect(outcome.nouls[dimension]).toBeGreaterThanOrEqual(0);
        expect(outcome.nouls[dimension]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("produces the same mock judgment for the same state", async () => {
    delete process.env.TYPESAFE_API_KEY;
    vi.resetModules();
    const { evaluateState } = await import("@/lib/jev/evaluate-step");

    const a = await evaluateState(state);
    const b = await evaluateState(state);
    expect(a).toEqual(b);
  });
});
