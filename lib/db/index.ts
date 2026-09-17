/**
 * Database handle.
 *
 * The rest of the app imports `db` and the schema only — no driver types leak
 * past this module, so replacing SQLite with PostgreSQL means changing this
 * file and the `sqliteTable` calls in `schema.ts`, nothing else.
 */
import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "./schema";

const DB_PATH = resolve(process.cwd(), process.env.DATABASE_URL ?? "./data/jevscope.db");

function createConnection() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  bootstrap(sqlite);
  return drizzle(sqlite, { schema });
}

/**
 * Creates tables on first use so `npm install && npm run dev` just works.
 * Drizzle Kit migrations remain available via `npm run db:generate`.
 */
function bootstrap(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      task TEXT NOT NULL,
      system_context TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      demo_key TEXT,
      started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      "index" INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_name TEXT,
      tool_arguments TEXT,
      tool_result TEXT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS steps_run_idx ON steps(run_id, "index");

    CREATE TABLE IF NOT EXISTS semantic_evaluations (
      id TEXT PRIMARY KEY,
      step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
      task_alignment REAL NOT NULL,
      progress REAL NOT NULL,
      repetition REAL NOT NULL,
      stuck REAL NOT NULL,
      needs_verification REAL NOT NULL,
      premature_completion REAL NOT NULL,
      unexpected_direction REAL NOT NULL,
      phase TEXT NOT NULL,
      phase_probabilities TEXT NOT NULL,
      phase_confidence REAL NOT NULL,
      latency_ms INTEGER NOT NULL,
      model TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'jev',
      request_state TEXT NOT NULL,
      request_questions TEXT NOT NULL,
      raw_response TEXT NOT NULL,
      request_id TEXT,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS evaluations_step_idx ON semantic_evaluations(step_id);

    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      config TEXT NOT NULL,
      result TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'jev',
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS experiments_step_idx ON experiments(step_id);

    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS dataset_scenarios (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      task TEXT NOT NULL,
      history TEXT NOT NULL,
      current_step TEXT NOT NULL,
      expected TEXT
    );
    CREATE INDEX IF NOT EXISTS scenarios_dataset_idx ON dataset_scenarios(dataset_id);

    CREATE TABLE IF NOT EXISTS dataset_runs (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'jev',
      predictions TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS dataset_runs_dataset_idx ON dataset_runs(dataset_id);
  `);
}

// Next.js dev-server hot reload would otherwise open a new handle per compile.
const globalForDb = globalThis as unknown as { __jevscopeDb?: ReturnType<typeof createConnection> };

export const db = globalForDb.__jevscopeDb ?? createConnection();

if (process.env.NODE_ENV !== "production") globalForDb.__jevscopeDb = db;

export { schema };
