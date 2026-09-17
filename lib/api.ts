/**
 * Shared helpers for route handlers.
 *
 * Validation errors return field-level detail because callers are developers
 * wiring up an agent; internal errors return a generic message because their
 * text can contain paths, configuration, or credentials.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

export const MAX_BODY_BYTES = 256 * 1024;

export function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

/** Reads and validates a JSON body under a size limit. */
export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const raw = await request.text();

  if (raw.length > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: jsonError(`Request body exceeds ${MAX_BODY_BYTES} bytes`, 413),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError("Request body must be valid JSON", 400) };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      response: jsonError("Validation failed", 422, z.treeifyError(result.error)),
    };
  }

  return { ok: true, data: result.data };
}

/** Wraps a handler so an unexpected throw never leaks internals to the client. */
export async function guard<T>(handler: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await handler();
  } catch (error) {
    console.error("[jevscope] unhandled route error:", error);
    return jsonError("Internal error", 500);
  }
}
