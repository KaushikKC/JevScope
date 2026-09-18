import { NextResponse } from "next/server";

import { guard, jsonError } from "@/lib/api";
import { evaluateDataset, getDataset } from "@/lib/evaluations/datasets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ datasetId: string }> },
) {
  return guard(async () => {
    const { datasetId } = await params;
    if (!getDataset(datasetId)) return jsonError("Dataset not found", 404);
    return NextResponse.json({ run: await evaluateDataset(datasetId) });
  });
}
