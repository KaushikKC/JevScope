/**
 * Server-side TypeSafe client.
 *
 * `import "server-only"` is the guard that keeps TYPESAFE_API_KEY out of any
 * client bundle: importing this from a client component is a build error, not a
 * runtime leak. The key is never returned by an API route, never logged, and
 * never placed in a response body.
 */
import "server-only";

import { TypeSafeClient } from "@typesafe-ai/sdk";

export const DEFAULT_MODEL = process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest";

let cached: TypeSafeClient | null = null;

export function hasApiKey(): boolean {
  const key = process.env.TYPESAFE_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * Returns the shared client, or null when no key is configured. Callers fall
 * back to mock mode rather than throwing, so the app is usable without a key.
 */
export function getJevClient(): TypeSafeClient | null {
  if (!hasApiKey()) return null;
  if (!cached) {
    cached = new TypeSafeClient({
      defaultModel: DEFAULT_MODEL,
      // Per-attempt timeout. Step ingestion should fail fast and degrade to
      // "evaluation unavailable" rather than hold a request open.
      timeout: 20_000,
      // `warn` avoids the SDK's debug logging, which would print request bodies.
      logLevel: "warn",
    });
  }
  return cached;
}

/** Whether measured Jev results are available, or only mock judgments. */
export function judgmentSource(): "jev" | "mock" {
  return hasApiKey() ? "jev" : "mock";
}

export { TypeSafeClient };
