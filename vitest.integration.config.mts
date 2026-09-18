import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Opt-in integration tests. These make real System One requests and therefore
 * spend credit, so they live behind `npm run test:integration` and skip
 * themselves entirely when TYPESAFE_API_KEY is absent.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // The server-only guard is a build-time marker; Node tests stub it out.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 120_000,
    // Sequential: these hit a rate-limited API.
    fileParallelism: false,
  },
});
