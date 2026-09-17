/**
 * Persistence schema.
 *
 * Portability note: this targets SQLite for local development, but every column
 * uses a type with a direct PostgreSQL analogue. Timestamps are stored as epoch
 * milliseconds (integer) and structured payloads as JSON text, so swapping in
 * `drizzle-orm/pg-core` requires changing only this file and `lib/db/index.ts`.
 * No SQLite-specific behaviour leaks into the query layer.
 */
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Where a judgment came from. Mock judgments must never be shown as Jev results. */
export const JUDGMENT_SOURCES = ["jev", "mock"] as const;
export type JudgmentSource = (typeof JUDGMENT_SOURCES)[number];

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  task: text("task").notNull(),
  systemContext: text("system_context"),
  status: text("status", { enum: ["running", "completed", "failed"] })
    .notNull()
    .default("running"),
  /** Identifies a built-in demo fixture this run was seeded from, if any. */
  demoKey: text("demo_key"),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const steps = sqliteTable(
  "steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    eventType: text("event_type", {
      enum: [
        "message",
        "tool_call",
        "tool_result",
        "file_read",
        "file_write",
        "shell",
        "test",
        "completion",
      ],
    }).notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name"),
    /** JSON text. Inert data: never deserialized into anything executable. */
    toolArguments: text("tool_arguments"),
    toolResult: text("tool_result"),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("steps_run_idx").on(table.runId, table.index)],
);

export const semanticEvaluations = sqliteTable(
  "semantic_evaluations",
  {
    id: text("id").primaryKey(),
    stepId: text("step_id")
      .notNull()
      .references(() => steps.id, { onDelete: "cascade" }),

    // Noul judgments: probability that the answer to each question is "yes".
    taskAlignment: real("task_alignment").notNull(),
    progress: real("progress").notNull(),
    repetition: real("repetition").notNull(),
    stuck: real("stuck").notNull(),
    needsVerification: real("needs_verification").notNull(),
    prematureCompletion: real("premature_completion").notNull(),
    unexpectedDirection: real("unexpected_direction").notNull(),

    // Choice judgment.
    phase: text("phase", {
      enum: [
        "exploring",
        "implementing",
        "verifying",
        "recovering",
        "finished",
        "unclear",
      ],
    }).notNull(),
    /** JSON text: Record<phase, probability>. */
    phaseProbabilities: text("phase_probabilities").notNull(),
    phaseConfidence: real("phase_confidence").notNull(),

    latencyMs: integer("latency_ms").notNull(),
    model: text("model").notNull(),
    /** "jev" for measured results, "mock" for the no-API-key fallback. */
    source: text("source", { enum: JUDGMENT_SOURCES }).notNull().default("jev"),

    /** Exact state and questions sent, plus the unmodified response. For reproducibility. */
    requestState: text("request_state").notNull(),
    requestQuestions: text("request_questions").notNull(),
    rawResponse: text("raw_response").notNull(),
    requestId: text("request_id"),

    /** Populated instead of the above when evaluation failed; the step still persists. */
    error: text("error"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("evaluations_step_idx").on(table.stepId)],
);

/** A DecisionScope robustness experiment over one step's judgment. */
export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    stepId: text("step_id")
      .notNull()
      .references(() => steps.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["perturbation", "repeatability"] }).notNull(),
    /** JSON text: the settings the experiment ran with (seed, window, repeats). */
    config: text("config").notNull(),
    /** JSON text: the full result payload. Structure depends on `kind`. */
    result: text("result").notNull(),
    source: text("source", { enum: JUDGMENT_SOURCES }).notNull().default("jev"),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("experiments_step_idx").on(table.stepId)],
);

/** A labelled evaluation dataset. Scenarios live in `datasetScenarios`. */
export const datasets = sqliteTable("datasets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const datasetScenarios = sqliteTable(
  "dataset_scenarios",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    task: text("task").notNull(),
    /** JSON text: TraceEventInput[] */
    history: text("history").notNull(),
    /** JSON text: TraceEventInput */
    currentStep: text("current_step").notNull(),
    /** JSON text: ExpectedLabels. Every field is optional; absent means unlabelled. */
    expected: text("expected"),
  },
  (table) => [index("scenarios_dataset_idx").on(table.datasetId)],
);

/** One evaluated pass over a dataset. Predictions are stored raw, never thresholded. */
export const datasetRuns = sqliteTable(
  "dataset_runs",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    source: text("source", { enum: JUDGMENT_SOURCES }).notNull().default("jev"),
    /** JSON text: ScenarioPrediction[] — raw probabilities, one entry per scenario. */
    predictions: text("predictions").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("dataset_runs_dataset_idx").on(table.datasetId)],
);

export type RunRow = typeof runs.$inferSelect;
export type StepRow = typeof steps.$inferSelect;
export type SemanticEvaluationRow = typeof semanticEvaluations.$inferSelect;
export type ExperimentRow = typeof experiments.$inferSelect;
export type DatasetRow = typeof datasets.$inferSelect;
export type DatasetScenarioRow = typeof datasetScenarios.$inferSelect;
export type DatasetRunRow = typeof datasetRuns.$inferSelect;
