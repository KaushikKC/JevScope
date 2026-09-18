/**
 * Checks your JevScope setup end to end with a five-step agent that goes in
 * circles: it flips the same setting back and forth while the same test keeps
 * failing.
 *
 * The agent's actions are scripted so you can reproduce the run. The
 * judgments are not: each step goes through the real evaluator, exactly as
 * your own agent's steps would.
 *
 *   npm run dev                         # in another terminal
 *   npx tsx examples/stuck-agent.ts     # JEVSCOPE_URL defaults to localhost:3000
 */
import { JevScope, type StepEvent } from "../clients/jevscope";

const scope = new JevScope({ baseUrl: process.env.JEVSCOPE_URL });

const FAILING = "FAIL login.test.ts: expected 200, got 401";

const steps: StepEvent[] = [
  {
    eventType: "test",
    content: "Running the login tests.",
    toolName: "shell",
    toolArguments: { command: "npm test login" },
    toolResult: FAILING,
  },
  {
    eventType: "file_write",
    content: "Changing the token expiry from 60 to 3600.",
    toolName: "edit_file",
    toolArguments: { path: "src/auth.ts" },
    toolResult: "ok",
  },
  {
    eventType: "test",
    content: "Running the login tests again.",
    toolName: "shell",
    toolArguments: { command: "npm test login" },
    toolResult: FAILING,
  },
  {
    eventType: "file_write",
    content: "Changing the token expiry back from 3600 to 60.",
    toolName: "edit_file",
    toolArguments: { path: "src/auth.ts" },
    toolResult: "ok",
  },
  {
    eventType: "test",
    content: "Running the login tests again.",
    toolName: "shell",
    toolArguments: { command: "npm test login" },
    toolResult: FAILING,
  },
];

async function main() {
  const run = await scope.startRun({
    name: "Stuck agent (example)",
    task: "Fix the failing login test.",
  });
  console.log(`Watch it live: ${run.url}\n`);

  for (const [i, event] of steps.entries()) {
    // `step` waits for the judgment so this script can print it. An agent that
    // should not wait on the evaluator uses `run.report(event)` instead.
    const { evaluation, evaluationError } = await run.step(event);
    if (!evaluation) {
      console.log(`step ${i + 1}  evaluation unavailable: ${evaluationError}`);
      continue;
    }
    const { progress, repetition, stuck } = evaluation.nouls;
    console.log(
      `step ${i + 1}  progress ${progress.toFixed(2)}  repetition ${repetition.toFixed(2)}  ` +
        `stuck ${stuck.toFixed(2)}  ${evaluation.phase.padEnd(12)} ` +
        `[${evaluation.source}, ${evaluation.latencyMs} ms]`,
    );
  }

  await run.finish("failed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
