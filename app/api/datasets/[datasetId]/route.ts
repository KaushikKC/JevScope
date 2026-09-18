import { NextResponse } from "next/server";

import { guard, jsonError } from "@/lib/api";
import {
  deleteDataset,
  getDataset,
  getLatestDatasetRun,
  getScenarios,
} from "@/lib/evaluations/datasets";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ datasetId: string }> },
) {
  return guard(async () => {
    const { datasetId } = await params;
    const dataset = getDataset(datasetId);
    if (!dataset) return jsonError("Dataset not found", 404);
    return NextResponse.json({
      dataset,
      scenarios: getScenarios(datasetId),
      latestRun: getLatestDatasetRun(datasetId),
    });
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ datasetId: string }> },
) {
  return guard(async () => {
    const { datasetId } = await params;
    if (!getDataset(datasetId)) return jsonError("Dataset not found", 404);
    deleteDataset(datasetId);
    return NextResponse.json({ deleted: true });
  });
}
