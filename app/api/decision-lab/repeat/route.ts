import { NextResponse } from "next/server";
import { z } from "zod";

import { guard, jsonError, readBody } from "@/lib/api";
import { buildState } from "@/lib/jev/build-state";
import { runRepeatabilityExperiment } from "@/lib/experiments/run";
import { getRun, getStep, getSteps } from "@/lib/trace/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The options offered in the UI. Capped so one click cannot spend unbounded credit. */
export const ALLOWED_REPEATS = [1, 5, 10, 25] as const;

const schema = z.object({
  stepId: z.string().min(1),
  repeats: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(25)]),
  historyWindow: z.number().int().min(0).max(20).optional(),
});

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readBody(request, schema);
    if (!body.ok) return body.response;

    const step = getStep(body.data.stepId);
    if (!step) return jsonError("Step not found", 404);
    const run = getRun(step.runId);
    if (!run) return jsonError("Run not found", 404);

    const history = getSteps(run.id).filter((s) => s.index < step.index);
    const state = buildState(
      { task: run.task, systemContext: run.systemContext, currentStep: step, history },
      { historyWindow: body.data.historyWindow },
    );

    const result = await runRepeatabilityExperiment(step.id, state, body.data.repeats);
    return NextResponse.json(result);
  });
}
