import { NextResponse } from "next/server";
import { z } from "zod";

import { guard, jsonError, readBody } from "@/lib/api";
import { buildState } from "@/lib/jev/build-state";
import { runPerturbationExperiment } from "@/lib/experiments/run";
import { perturbationConfigSchema } from "@/lib/perturbations";
import { getRun, getStep, getSteps } from "@/lib/trace/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  stepId: z.string().min(1),
  perturbations: z.array(perturbationConfigSchema).min(1).max(8),
  historyWindow: z.number().int().min(0).max(20).optional(),
  includeControl: z.boolean().optional(),
});

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readBody(request, schema);
    if (!body.ok) return body.response;

    const step = getStep(body.data.stepId);
    if (!step) return jsonError("Step not found", 404);
    const run = getRun(step.runId);
    if (!run) return jsonError("Run not found", 404);

    // Rebuilt rather than read back from the stored evaluation, so a changed
    // history window takes effect and the state stays a pure function of inputs.
    const history = getSteps(run.id).filter((s) => s.index < step.index);
    const state = buildState(
      {
        task: run.task,
        systemContext: run.systemContext,
        currentStep: step,
        history,
      },
      { historyWindow: body.data.historyWindow },
    );

    const result = await runPerturbationExperiment(step.id, state, body.data.perturbations, {
      includeControl: body.data.includeControl,
    });

    return NextResponse.json(result);
  });
}
