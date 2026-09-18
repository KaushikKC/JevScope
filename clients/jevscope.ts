/**
 * JevScope client for TypeScript / JavaScript agents.
 *
 * One file, no dependencies, works anywhere `fetch` exists (Node 18+, Bun,
 * Deno, browsers). Copy it into your project or import it from here.
 *
 *   const scope = new JevScope({ baseUrl: "http://localhost:3000" });
 *   const run = await scope.startRun({ name: "My agent", task: "Fix the failing build" });
 *
 *   // wrap a tool: it runs, then the call and its result are reported
 *   const out = await run.tool("shell", { command: "npm test" }, () => exec("npm test"));
 *
 *   // or report any event yourself
 *   run.report({ eventType: "message", content: "Tests pass. Opening a PR." });
 *
 *   await run.finish();
 *
 * `report` and `tool` never block your agent on the evaluator: events go out
 * in the background, strictly in order (JevScope numbers steps by arrival, and
 * each judgment looks at the steps before it). Reporting failures go to
 * `onError` and never throw into the agent. Use `step` when you want to wait
 * for the judgment, for example to stop a run that is going in circles.
 */

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

export interface StepEvent {
  eventType: EventType;
  /** What the agent said it was doing, or what happened. Required, non-empty. */
  content: string;
  toolName?: string;
  toolArguments?: unknown;
  toolResult?: unknown;
  /** ISO 8601 or epoch millis. Defaults to arrival time. */
  timestamp?: string | number;
}

export interface Judgment {
  source: "jev" | "mock";
  model: string;
  latencyMs: number;
  /** Probability of yes, 0 to 1, per question. */
  nouls: {
    taskAlignment: number;
    progress: number;
    repetition: number;
    stuck: number;
    needsVerification: number;
    prematureCompletion: number;
    unexpectedDirection: number;
  };
  phase: string;
  phaseProbabilities: Record<string, number>;
  /** How concentrated the phase distribution is. Not correctness. */
  phaseConfidence: number;
  /** Everything sent and received, for inspection. */
  requestState: unknown;
  rawResponse: unknown;
}

export interface StepResult {
  step: { id: string; index: number };
  /** `null` when the evaluator was unreachable. The step itself is still stored. */
  evaluation: Judgment | null;
  evaluationError?: string;
}

export interface JevScopeOptions {
  /** Where JevScope is running. Default `http://localhost:3000`. */
  baseUrl?: string;
  /** Called when a background report fails. Default: `console.warn`. */
  onError?: (error: Error) => void;
  fetch?: typeof fetch;
}

/** Stays under the server's 20,000-character limits, which reject rather than truncate. */
const MAX_CHARS = 19_000;

/** Keeps the head and the tail: the end of a log usually carries the outcome. */
function clampText(value: string): string {
  if (value.length <= MAX_CHARS) return value;
  const head = Math.ceil(MAX_CHARS * 0.6);
  const tail = MAX_CHARS - head;
  return `${value.slice(0, head)}\n…[${value.length - MAX_CHARS} characters omitted]…\n${value.slice(-tail)}`;
}

function clampPayload(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return clampText(value);
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
  return serialized.length <= MAX_CHARS ? value : clampText(serialized);
}

export class JevScope {
  readonly baseUrl: string;
  private readonly onError: (error: Error) => void;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JevScopeOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this.onError = options.onError ?? ((error) => console.warn(`[jevscope] ${error.message}`));
    this.fetchImpl = options.fetch ?? fetch;
  }

  async startRun(input: { name: string; task: string; systemContext?: string }): Promise<Run> {
    const body = (await this.request("POST", "/api/runs", input)) as { run: { id: string } };
    return new Run(this, body.run.id, this.onError);
  }

  /** @internal */
  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `${method} ${path} failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
      );
    }
    return text ? JSON.parse(text) : null;
  }
}

export class Run {
  /** Open this in a browser to watch the run live. */
  readonly url: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly scope: JevScope,
    readonly id: string,
    private readonly onError: (error: Error) => void,
  ) {
    this.url = `${scope.baseUrl}/runs/${id}`;
  }

  /** Sends one event and waits for its judgment. */
  step(event: StepEvent): Promise<StepResult> {
    const body = {
      ...event,
      content: clampText(event.content.trim() || `${event.eventType} event`),
      toolArguments: clampPayload(event.toolArguments),
      toolResult: clampPayload(event.toolResult),
    };
    const sent = this.queue.then(
      () =>
        this.scope.request("POST", `/api/runs/${this.id}/steps`, body) as Promise<StepResult>,
    );
    this.queue = sent.catch(() => undefined);
    return sent;
  }

  /** Sends one event in the background. Never throws, never blocks. */
  report(event: StepEvent): void {
    this.step(event).catch((error: Error) => this.onError(error));
  }

  /**
   * Runs a tool and reports it. The tool's result (or error) is returned or
   * rethrown unchanged, so wrapping a tool never changes what your agent sees.
   */
  async tool<T>(
    toolName: string,
    toolArguments: unknown,
    execute: () => T | Promise<T>,
    content = `Calling ${toolName}.`,
  ): Promise<T> {
    try {
      const result = await execute();
      this.report({ eventType: "tool_call", content, toolName, toolArguments, toolResult: result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.report({
        eventType: "tool_call",
        content,
        toolName,
        toolArguments,
        toolResult: { error: message },
      });
      throw error;
    }
  }

  /** Waits until every reported event has been sent. */
  async flush(): Promise<void> {
    await this.queue;
  }

  /** Flushes, then marks the run finished. */
  async finish(status: "completed" | "failed" = "completed"): Promise<void> {
    await this.flush();
    try {
      await this.scope.request("PATCH", `/api/runs/${this.id}`, { status });
    } catch (error) {
      this.onError(error as Error);
    }
  }
}
