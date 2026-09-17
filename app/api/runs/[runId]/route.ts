import { NextResponse } from "next/server";

import { guard, jsonError, readBody } from "@/lib/api";
import { getEvaluationsForRun, getRun, getSteps, updateRunStatus } from "@/lib/trace/ingest";
import { coerceTimestamp, updateRunSchema } from "@/lib/trace/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return guard(async () => {
    const { runId } = await params;
    const run = getRun(runId);
    if (!run) return jsonError("Run not found", 404);

    const steps = getSteps(runId);
    const evaluations = getEvaluationsForRun(runId);

    return NextResponse.json({
      run,
      steps: steps.map((step) => ({
        step,
        evaluation: evaluations.get(step.id) ?? null,
      })),
    });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return guard(async () => {
    const { runId } = await params;
    if (!getRun(runId)) return jsonError("Run not found", 404);

    const body = await readBody(request, updateRunSchema);
    if (!body.ok) return body.response;

    if (body.data.status) {
      updateRunStatus(
        runId,
        body.data.status,
        body.data.finishedAt ? coerceTimestamp(body.data.finishedAt) : undefined,
      );
    }
    return NextResponse.json({ run: getRun(runId) });
  });
}
