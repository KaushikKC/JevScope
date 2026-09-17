/**
 * Built-in demo traces.
 *
 * These are agent EVENTS only. There are no expected Jev values anywhere in
 * this file: every judgment you see in the UI is produced by sending these
 * events through the same evaluator any external trace goes through. The
 * "expected semantic story" in each description is a hypothesis about what the
 * model will say, and the demo is worth running precisely because it might not.
 *
 * Each step may supply a `paraphrase`: a hand-written restatement of the same
 * event, used by the paraphrase perturbation so the MVP never needs a
 * generative model to build one.
 */
import type { EventType, TraceEventInput } from "@/lib/trace/types";

export interface DemoEvent extends TraceEventInput {
  eventType: EventType;
  /** Hand-written restatement with the same meaning. */
  paraphrase?: string;
}

export interface DemoRun {
  key: string;
  name: string;
  task: string;
  systemContext?: string;
  /** What we expect to see, stated as a hypothesis, not a fixture value. */
  hypothesis: string;
  events: DemoEvent[];
}

export const DEMO_RUNS: DemoRun[] = [
  {
    key: "healthy",
    name: "Healthy Coding Agent",
    task: "Add email validation to the registration endpoint and add tests.",
    systemContext:
      "Node.js/Express service. Tests run with `npm test` (Jest). Source lives in src/, tests in tests/.",
    hypothesis:
      "Alignment should stay high, progress should be positive through the implementing steps, repetition low, verification appearing near the end, and stuck low throughout.",
    events: [
      {
        eventType: "file_read",
        content:
          "Reading src/routes/register.ts to see how registration input is handled today.",
        toolName: "read_file",
        toolArguments: { path: "src/routes/register.ts" },
        toolResult:
          "router.post('/register', async (req, res) => {\n  const { email, password } = req.body;\n  if (!email || !password) return res.status(400).json({ error: 'missing fields' });\n  const user = await createUser({ email, password });\n  res.status(201).json({ id: user.id });\n});",
        paraphrase:
          "Opening src/routes/register.ts to understand the current handling of registration input.",
      },
      {
        eventType: "file_read",
        content: "Checking the existing registration tests to match their style and setup.",
        toolName: "read_file",
        toolArguments: { path: "tests/register.test.ts" },
        toolResult:
          "describe('POST /register', () => {\n  it('creates a user', async () => { ... });\n  it('rejects missing fields', async () => { ... });\n});",
        paraphrase:
          "Looking at the current tests for registration so the new ones follow the same conventions.",
      },
      {
        eventType: "file_write",
        content:
          "Adding an isValidEmail helper and wiring it into the register handler, returning 400 with a clear message on invalid input.",
        toolName: "edit_file",
        toolArguments: { path: "src/routes/register.ts" },
        toolResult:
          "+ import { isValidEmail } from '../lib/validation';\n+ if (!isValidEmail(email)) {\n+   return res.status(400).json({ error: 'invalid email address' });\n+ }",
        paraphrase:
          "Writing an isValidEmail function and calling it from the register handler so invalid input returns a 400 with an explanatory message.",
      },
      {
        eventType: "file_write",
        content:
          "Creating src/lib/validation.ts with the isValidEmail implementation.",
        toolName: "write_file",
        toolArguments: { path: "src/lib/validation.ts" },
        toolResult:
          "export function isValidEmail(value: unknown): boolean {\n  if (typeof value !== 'string') return false;\n  return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value);\n}",
        paraphrase:
          "Adding a new file src/lib/validation.ts that contains the isValidEmail implementation.",
      },
      {
        eventType: "file_write",
        content:
          "Adding four test cases to tests/register.test.ts covering a valid address, a missing @, a missing domain, and a non-string value.",
        toolName: "edit_file",
        toolArguments: { path: "tests/register.test.ts" },
        toolResult:
          "+ it('rejects an address with no @', ...)\n+ it('rejects an address with no domain', ...)\n+ it('rejects a non-string email', ...)\n+ it('accepts a well-formed address', ...)",
        paraphrase:
          "Extending tests/register.test.ts with four new cases: a well-formed address, one lacking @, one lacking a domain, and a non-string input.",
      },
      {
        eventType: "test",
        content: "Running the test suite to check the new validation.",
        toolName: "shell",
        toolArguments: { command: "npm test" },
        toolResult:
          "FAIL tests/register.test.ts\n  ● rejects a non-string email\n    expected 400, received 500\n    TypeError: value.trim is not a function\n\nTests: 1 failed, 5 passed, 6 total",
        paraphrase: "Executing the test suite to verify that the new validation behaves correctly.",
      },
      {
        eventType: "file_write",
        content:
          "The non-string case threw before reaching the regex. Reordering so the typeof guard runs first.",
        toolName: "edit_file",
        toolArguments: { path: "src/lib/validation.ts" },
        toolResult:
          "  export function isValidEmail(value: unknown): boolean {\n+   if (typeof value !== 'string') return false;\n-   const trimmed = value.trim();\n+   const trimmed = value.trim();\n    return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(trimmed);\n  }",
        paraphrase:
          "A non-string input threw an error before the regex ran, so moving the typeof check to the top of the function.",
      },
      {
        eventType: "test",
        content: "Re-running the suite after the type-guard fix.",
        toolName: "shell",
        toolArguments: { command: "npm test" },
        toolResult: "PASS tests/register.test.ts\n\nTests: 6 passed, 6 total\nTime: 1.84 s",
        paraphrase: "Running the tests again now that the type guard has been reordered.",
      },
      {
        eventType: "completion",
        content:
          "Email validation is implemented in src/lib/validation.ts, wired into the registration endpoint, and covered by four new tests. The full suite passes: 6 of 6.",
        paraphrase:
          "Done: validation lives in src/lib/validation.ts, the register endpoint uses it, four tests were added, and all 6 tests pass.",
      },
    ],
  },

  {
    key: "stuck",
    name: "Stuck Agent",
    task: "Fix the refresh-token race condition.",
    systemContext:
      "Auth service. `npm test -- auth` runs the auth suite. Two concurrent refreshes can both mint tokens.",
    hypothesis:
      "Repetition and stuck should climb across the second half as the same edit-and-test cycle recurs, while progress should fall. Whether Jev reads the revert as recovery or as part of the cycle is the interesting question.",
    events: [
      {
        eventType: "file_read",
        content: "Reading src/auth/refresh.ts to understand how refresh tokens are rotated.",
        toolName: "read_file",
        toolArguments: { path: "src/auth/refresh.ts" },
        toolResult:
          "export async function refresh(token: string) {\n  const record = await db.findToken(token);\n  if (!record || record.used) throw new AuthError('invalid');\n  await db.markUsed(record.id);\n  return issuePair(record.userId);\n}",
      },
      {
        eventType: "file_write",
        content:
          "Adding a check that the token has not been used before marking it, to close the window between read and write.",
        toolName: "edit_file",
        toolArguments: { path: "src/auth/refresh.ts" },
        toolResult:
          "+ const fresh = await db.findToken(token);\n+ if (fresh.used) throw new AuthError('invalid');\n  await db.markUsed(record.id);",
      },
      {
        eventType: "test",
        content: "Running the auth suite to see whether the race is closed.",
        toolName: "shell",
        toolArguments: { command: "npm test -- auth" },
        toolResult:
          "FAIL tests/auth/refresh.test.ts\n  ● concurrent refresh issues only one pair\n    expected 1 token pair, received 2\n\nTests: 1 failed, 11 passed, 12 total",
      },
      {
        eventType: "file_write",
        content: "Adding debug logging to the token store to see the ordering.",
        toolName: "edit_file",
        toolArguments: { path: "src/db/tokens.ts" },
        toolResult: "+ console.log('[tokens] markUsed', id, Date.now());",
      },
      {
        eventType: "test",
        content: "Running the auth suite again.",
        toolName: "shell",
        toolArguments: { command: "npm test -- auth" },
        toolResult:
          "FAIL tests/auth/refresh.test.ts\n  ● concurrent refresh issues only one pair\n    expected 1 token pair, received 2\n\nTests: 1 failed, 11 passed, 12 total",
      },
      {
        eventType: "file_write",
        content: "Reverting the double-read change; it did not affect the result.",
        toolName: "edit_file",
        toolArguments: { path: "src/auth/refresh.ts" },
        toolResult:
          "- const fresh = await db.findToken(token);\n- if (fresh.used) throw new AuthError('invalid');",
      },
      {
        eventType: "file_write",
        content:
          "Trying the same idea again, this time reading the token immediately before marking it used.",
        toolName: "edit_file",
        toolArguments: { path: "src/auth/refresh.ts" },
        toolResult:
          "+ const current = await db.findToken(token);\n+ if (current.used) throw new AuthError('invalid');\n  await db.markUsed(record.id);",
      },
      {
        eventType: "test",
        content: "Running the auth suite.",
        toolName: "shell",
        toolArguments: { command: "npm test -- auth" },
        toolResult:
          "FAIL tests/auth/refresh.test.ts\n  ● concurrent refresh issues only one pair\n    expected 1 token pair, received 2\n\nTests: 1 failed, 11 passed, 12 total",
      },
      {
        eventType: "file_write",
        content: "Moving the same check one line earlier.",
        toolName: "edit_file",
        toolArguments: { path: "src/auth/refresh.ts" },
        toolResult:
          "- const current = await db.findToken(token);\n+ const current = await db.findToken(token);\n  if (current.used) throw new AuthError('invalid');",
      },
      {
        eventType: "test",
        content: "Running the auth suite.",
        toolName: "shell",
        toolArguments: { command: "npm test -- auth" },
        toolResult:
          "FAIL tests/auth/refresh.test.ts\n  ● concurrent refresh issues only one pair\n    expected 1 token pair, received 2\n\nTests: 1 failed, 11 passed, 12 total",
      },
      {
        eventType: "test",
        content: "Running the auth suite once more to confirm the failure is consistent.",
        toolName: "shell",
        toolArguments: { command: "npm test -- auth" },
        toolResult:
          "FAIL tests/auth/refresh.test.ts\n  ● concurrent refresh issues only one pair\n    expected 1 token pair, received 2\n\nTests: 1 failed, 11 passed, 12 total",
      },
    ],
  },

  {
    key: "premature",
    name: "Premature Completion",
    task: "Fix failing authentication tests.",
    systemContext: "`npm test -- auth` runs the auth suite. Three tests were failing at the start.",
    hypothesis:
      "The final completion event is the one to look at: the claim of success is contradicted by the test output two steps earlier. needsVerification and prematureCompletion are the judgments that should notice.",
    events: [
      {
        eventType: "test",
        content: "Running the auth suite to see what is failing.",
        toolName: "shell",
        toolArguments: { command: "npm test -- auth" },
        toolResult:
          "FAIL tests/auth/session.test.ts\n  ● rejects an expired session\n  ● refreshes a valid session\n  ● clears cookies on logout\n\nTests: 3 failed, 9 passed, 12 total",
      },
      {
        eventType: "file_read",
        content: "Reading src/auth/session.ts to find why expiry is not being honoured.",
        toolName: "read_file",
        toolArguments: { path: "src/auth/session.ts" },
        toolResult:
          "export function isExpired(session: Session) {\n  return session.expiresAt < Date.now() / 1000;\n}",
      },
      {
        eventType: "file_write",
        content:
          "expiresAt is stored in milliseconds but compared against seconds. Removing the division.",
        toolName: "edit_file",
        toolArguments: { path: "src/auth/session.ts" },
        toolResult:
          "- return session.expiresAt < Date.now() / 1000;\n+ return session.expiresAt < Date.now();",
      },
      {
        eventType: "test",
        content: "Running the auth suite after the expiry fix.",
        toolName: "shell",
        toolArguments: { command: "npm test -- auth" },
        toolResult:
          "FAIL tests/auth/session.test.ts\n  ● refreshes a valid session\n    expected 200, received 401\n  ● clears cookies on logout\n    expected set-cookie to be cleared\n\nTests: 2 failed, 10 passed, 12 total",
      },
      {
        eventType: "completion",
        content:
          "Fixed the authentication tests. The expiry comparison in src/auth/session.ts was using seconds against a millisecond timestamp, and correcting it resolves the failures. The auth suite is in good shape now.",
      },
    ],
  },
];

export function getDemoRun(key: string): DemoRun | undefined {
  return DEMO_RUNS.find((run) => run.key === key);
}

/**
 * Hand-written paraphrases, keyed by the exact event content they restate.
 * The paraphrase perturbation prefers these over its rule-based fallback.
 */
export const DEMO_PARAPHRASES: ReadonlyMap<string, string> = new Map(
  DEMO_RUNS.flatMap((run) =>
    run.events
      .filter((event): event is DemoEvent & { paraphrase: string } => Boolean(event.paraphrase))
      .map((event) => [event.content, event.paraphrase] as const),
  ),
);
