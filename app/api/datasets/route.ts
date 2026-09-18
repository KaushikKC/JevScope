import { NextResponse } from "next/server";

import { guard, readBody } from "@/lib/api";
import { BUILT_IN_BENCHMARK, datasetSchema } from "@/lib/fixtures/benchmark";
import { importDataset, listDatasets } from "@/lib/evaluations/datasets";

export const dynamic = "force-dynamic";

export async function GET() {
  return guard(async () => NextResponse.json({ datasets: listDatasets() }));
}

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readBody(request, datasetSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ dataset: importDataset(body.data) }, { status: 201 });
  });
}

/** Seeds the built-in benchmark. Separate verb so import stays a pure upload. */
export async function PUT() {
  return guard(async () =>
    NextResponse.json({ dataset: importDataset(BUILT_IN_BENCHMARK) }, { status: 201 }),
  );
}
