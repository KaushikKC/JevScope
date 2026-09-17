/**
 * Step ingestion.
 *
 * Validate -> persist -> build state -> evaluate -> persist evaluation -> return.
 *
 * A failed evaluation returns HTTP 201 with `evaluation: null` and an
 * `evaluationError`. The step was accepted; only the judgment is missing. An
 * error status here would tell a caller to retry and duplicate its trace data.
 */
import { NextResponse } from "next/server";

import { guard, jsonError, readBody } from "@/lib/api";
import { getRun, ingestStep } from "@/lib/trace/ingest";
import { traceEventSchema } from "@/lib/trace/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return guard(async () => {
    const { runId } = await params;
    if (!getRun(runId)) return jsonError("Run not found", 404);

    const body = await readBody(request, traceEventSchema);
    if (!body.ok) return body.response;

    const result = await ingestStep(runId, body.data);
    return NextResponse.json(result, { status: 201 });
  });
}
