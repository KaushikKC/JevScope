/**
 * Runs one minimal evaluation against the configured key.
 *
 * Returns success, model, and latency. It never returns the key, any prefix of
 * it, or its length.
 */
import { NextResponse } from "next/server";
import { noul } from "@typesafe-ai/sdk";

import { guard } from "@/lib/api";
import { DEFAULT_MODEL, getJevClient, hasApiKey } from "@/lib/jev/client";
import { describeError } from "@/lib/jev/evaluate-step";

export const dynamic = "force-dynamic";

export async function POST() {
  return guard(async () => {
    if (!hasApiKey()) {
      return NextResponse.json({
        success: false,
        configured: false,
        message:
          "TYPESAFE_API_KEY is not set. Copy .env.example to .env.local and add your key, then restart the dev server.",
      });
    }

    const client = getJevClient();
    if (!client) {
      return NextResponse.json({ success: false, configured: false, message: "Client unavailable." });
    }

    const startedAt = performance.now();
    try {
      const result = await client.systemOne({
        // The smallest request that still exercises auth, transport, and parsing.
        state: { check: "A connectivity probe from JevScope." },
        questions: {
          reachable: noul("Is the text in `check` written in English?", {
            true: "The text is in English.",
            false: "The text is in another language.",
          }),
        },
      });
      return NextResponse.json({
        success: true,
        configured: true,
        model: result.model,
        latencyMs: Math.round(performance.now() - startedAt),
        inputTokens: result.usage.input_tokens,
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        configured: true,
        latencyMs: Math.round(performance.now() - startedAt),
        model: DEFAULT_MODEL,
        message: describeError(error),
      });
    }
  });
}
