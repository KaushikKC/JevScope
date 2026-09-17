import { NextResponse } from "next/server";

import { guard, readBody } from "@/lib/api";
import { createRun, getEvaluationsForRun, getSteps, listRuns } from "@/lib/trace/ingest";
import { createRunSchema } from "@/lib/trace/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return guard(async () => {
    const runs = listRuns().map((run) => {
      const steps = getSteps(run.id);
      const evaluations = getEvaluationsForRun(run.id);
      const measured = [...evaluations.values()].filter((e) => !e.unavailable);
      return {
        ...run,
        stepCount: steps.length,
        evaluationCount: measured.length,
        averageLatencyMs: measured.length
          ? Math.round(measured.reduce((a, e) => a + e.latencyMs, 0) / measured.length)
          : null,
      };
    });
    return NextResponse.json({ runs });
  });
}

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readBody(request, createRunSchema);
    if (!body.ok) return body.response;
    const run = createRun(body.data);
    return NextResponse.json({ run }, { status: 201 });
  });
}
