/**
 * Demo run setup.
 *
 * This creates the run and hands back the fixture events. It deliberately does
 * NOT evaluate them: the client posts each event to the ordinary
 * /api/runs/:runId/steps endpoint, one at a time, so the demo exercises the
 * real ingestion path and you watch real judgments arrive in order.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { guard, jsonError, readBody } from "@/lib/api";
import { DEMO_RUNS, getDemoRun } from "@/lib/fixtures/demo-runs";
import { createRun } from "@/lib/trace/ingest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");

  if (key) {
    const demo = getDemoRun(key);
    if (!demo) return jsonError("Unknown demo", 404);
    return NextResponse.json({
      demo: { key: demo.key, name: demo.name, task: demo.task, hypothesis: demo.hypothesis },
      events: demo.events.map(({ paraphrase: _paraphrase, ...event }) => event),
    });
  }

  return NextResponse.json({
    demos: DEMO_RUNS.map(({ key: demoKey, name, task, hypothesis, events }) => ({
      key: demoKey,
      name,
      task,
      hypothesis,
      stepCount: events.length,
    })),
  });
}

const startSchema = z.object({ demoKey: z.string().min(1).max(64) });

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readBody(request, startSchema);
    if (!body.ok) return body.response;

    const demo = getDemoRun(body.data.demoKey);
    if (!demo) return jsonError("Unknown demo", 404);

    const run = createRun({
      name: demo.name,
      task: demo.task,
      systemContext: demo.systemContext,
      demoKey: demo.key,
    });

    return NextResponse.json(
      {
        run,
        // Only the ingestion contract fields; `paraphrase` stays server-side
        // as perturbation material and is not part of the trace.
        events: demo.events.map(({ paraphrase: _paraphrase, ...event }) => event),
      },
      { status: 201 },
    );
  });
}
