import { NextResponse } from "next/server";

import { guard, jsonError } from "@/lib/api";
import { exportDataset, getLatestDatasetRun } from "@/lib/evaluations/datasets";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ datasetId: string }> },
) {
  return guard(async () => {
    const { datasetId } = await params;
    const dataset = exportDataset(datasetId);
    if (!dataset) return jsonError("Dataset not found", 404);

    // ?withResults=1 adds the latest raw predictions alongside the dataset, so
    // an experiment can be shared whole. Thresholds are not baked in.
    const withResults = new URL(request.url).searchParams.get("withResults") === "1";
    const payload = withResults
      ? { ...dataset, latestRun: getLatestDatasetRun(datasetId) }
      : dataset;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${dataset.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json"`,
      },
    });
  });
}
