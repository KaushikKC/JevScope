"use client";

/**
 * Evaluations: labelled datasets, real metrics, and the threshold explorer.
 *
 * The rule this screen exists to enforce: a number is only called precision,
 * recall, or F1 where a human-supplied label backs it. Unlabelled dimensions
 * show their raw probabilities and nothing more.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, Play, RotateCw, Trash2, Upload } from "lucide-react";

import { ThresholdExplorer } from "@/components/evaluations/threshold-explorer";
import { Disclosure, JsonBlock } from "@/components/ui/disclosure";
import { Badge, Button, EmptyState, Stat } from "@/components/ui/primitives";
import { DIMENSION_PRESENTATION, PHASE_PRESENTATION } from "@/lib/jev/presentation";
import { NOUL_DIMENSIONS, type NoulDimension } from "@/lib/jev/types";
import { choiceAccuracy } from "@/lib/metrics/classification";
import type { DatasetSummary, ScenarioPrediction } from "@/lib/evaluations/datasets";
import { cn, fmtDateTime, fmtLatency, fmtProbability } from "@/lib/ui";

interface DatasetDetail {
  dataset: DatasetSummary;
  latestRun: {
    id: string;
    model: string;
    source: "jev" | "mock";
    predictions: ScenarioPrediction[];
    createdAt: string;
  } | null;
}

export function EvaluationsView({ datasets }: { datasets: DatasetSummary[] }) {
  const [list, setList] = useState(datasets);
  const [selectedId, setSelectedId] = useState<string | null>(datasets[0]?.id ?? null);
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async (datasetId: string) => {
    setSelectedId(datasetId);
    setBusy("load");
    setError(null);
    try {
      const response = await fetch(`/api/datasets/${datasetId}`);
      if (!response.ok) throw new Error(`Could not load the dataset (HTTP ${response.status}).`);
      setDetail((await response.json()) as DatasetDetail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the dataset.");
    } finally {
      setBusy(null);
    }
  }, []);

  async function refreshList(selectId?: string) {
    const response = await fetch("/api/datasets");
    const { datasets: next } = (await response.json()) as { datasets: DatasetSummary[] };
    setList(next);
    if (selectId) await loadDetail(selectId);
  }

  async function seedBenchmark() {
    setBusy("seed");
    setError(null);
    try {
      const response = await fetch("/api/datasets", { method: "PUT" });
      if (!response.ok) throw new Error("Could not load the built-in benchmark.");
      const { dataset } = (await response.json()) as { dataset: DatasetSummary };
      await refreshList(dataset.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the benchmark.");
    } finally {
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    setBusy("import");
    setError(null);
    try {
      const text = await file.text();
      const response = await fetch("/api/datasets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          detail?.error ? `${detail.error}. Check the schema in the README.` : "Import failed.",
        );
      }
      const { dataset } = (await response.json()) as { dataset: DatasetSummary };
      await refreshList(dataset.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  }

  async function evaluate(datasetId: string) {
    setBusy("evaluate");
    setError(null);
    try {
      const response = await fetch(`/api/datasets/${datasetId}/evaluate`, { method: "POST" });
      if (!response.ok) throw new Error("Evaluation failed.");
      await loadDetail(datasetId);
      await refreshList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evaluation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(datasetId: string) {
    setBusy("delete");
    await fetch(`/api/datasets/${datasetId}`, { method: "DELETE" });
    setDetail(null);
    setSelectedId(null);
    await refreshList();
    setBusy(null);
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-1 gap-3 px-6 py-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <div className="flex gap-1.5">
            <Button className="flex-1" onClick={seedBenchmark} disabled={busy !== null}>
              Load benchmark
            </Button>
            <Button onClick={() => fileInput.current?.click()} disabled={busy !== null}>
              <Upload size={12} />
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.target.value = "";
              }}
            />
          </div>

          {list.length === 0 ? (
            <p className="panel px-3 py-4 text-center text-[11.5px] text-text-muted">
              No datasets yet. Load the built-in benchmark or import your own JSON.
            </p>
          ) : (
            <ul className="space-y-1">
              {list.map((dataset) => (
                <li key={dataset.id}>
                  <button
                    type="button"
                    onClick={() => loadDetail(dataset.id)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      selectedId === dataset.id
                        ? "border-border-strong bg-surface-2"
                        : "border-border bg-surface-1 hover:bg-surface-2",
                    )}
                  >
                    <div className="text-[12.5px] font-medium">{dataset.name}</div>
                    <div className="num mt-0.5 text-[11px] text-text-muted">
                      {dataset.scenarioCount} scenarios · {dataset.labelledCount} labelled
                    </div>
                    {dataset.latestRunAt && (
                      <div className="mt-0.5 text-[10.5px] text-text-muted">
                        evaluated {fmtDateTime(dataset.latestRunAt)}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="min-w-0 space-y-3">
          {error && (
            <p className="panel px-3.5 py-2.5 text-[12px] text-[var(--color-status-critical)]">
              {error}
            </p>
          )}

          {!detail ? (
            <EmptyState
              title="Select a dataset"
              description="A dataset is a set of agent moments with hand-written labels. Where a label exists, JevScope computes real classification metrics against it; where none exists, it shows the probability and says nothing more."
              action={
                list.length === 0 ? (
                  <Button variant="primary" onClick={seedBenchmark} disabled={busy !== null}>
                    Load the built-in benchmark
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DatasetDetailView
              detail={detail}
              busy={busy}
              onEvaluate={() => evaluate(detail.dataset.id)}
              onDelete={() => remove(detail.dataset.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DatasetDetailView({
  detail,
  busy,
  onEvaluate,
  onDelete,
}: {
  detail: DatasetDetail;
  busy: string | null;
  onEvaluate: () => void;
  onDelete: () => void;
}) {
  const { dataset, latestRun } = detail;
  const [dimension, setDimension] = useState<NoulDimension>("stuck");

  const labelCounts = useMemo(() => {
    const counts = Object.fromEntries(NOUL_DIMENSIONS.map((d) => [d, 0])) as Record<
      NoulDimension,
      number
    >;
    for (const prediction of latestRun?.predictions ?? []) {
      for (const key of NOUL_DIMENSIONS) {
        if (typeof prediction.expected?.[key] === "boolean") counts[key] += 1;
      }
    }
    return counts;
  }, [latestRun]);

  const explorerPredictions = useMemo(() => {
    return (latestRun?.predictions ?? []).flatMap((prediction) => {
      const expected = prediction.expected?.[dimension];
      if (typeof expected !== "boolean" || !prediction.nouls) return [];
      return [{ probability: prediction.nouls[dimension], expected }];
    });
  }, [dimension, latestRun]);

  const phaseMetrics = useMemo(() => {
    const pairs = (latestRun?.predictions ?? []).flatMap((prediction) =>
      prediction.expected?.phase && prediction.phase
        ? [{ predicted: prediction.phase, expected: prediction.expected.phase }]
        : [],
    );
    return pairs.length ? choiceAccuracy(pairs) : null;
  }, [latestRun]);

  const averageLatency = latestRun?.predictions.length
    ? Math.round(
        latestRun.predictions.reduce((a, p) => a + p.latencyMs, 0) / latestRun.predictions.length,
      )
    : null;

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
          <h2 className="text-[13px] font-medium">{dataset.name}</h2>
          {latestRun && (
            <Badge tone={latestRun.source === "mock" ? "warning" : "good"}>
              {latestRun.source === "mock" ? "MOCK" : "JEV"}
            </Badge>
          )}
          <div className="ml-auto flex gap-1.5">
            <a href={`/api/datasets/${dataset.id}/export?withResults=1`} download>
              <Button size="sm">
                <Download size={11} /> Export
              </Button>
            </a>
            <Button size="sm" variant="primary" onClick={onEvaluate} disabled={busy !== null}>
              {busy === "evaluate" ? (
                <>
                  <RotateCw size={11} className="animate-spin" /> Evaluating…
                </>
              ) : (
                <>
                  <Play size={11} /> {latestRun ? "Re-evaluate" : "Evaluate"}
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy !== null}>
              <Trash2 size={11} />
            </Button>
          </div>
        </div>

        {dataset.description && (
          <p className="border-b border-border px-3.5 py-2.5 text-[12px] leading-relaxed text-text-secondary">
            {dataset.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 p-3.5 sm:grid-cols-4">
          <Stat label="Scenarios" value={dataset.scenarioCount} />
          <Stat
            label="With labels"
            value={dataset.labelledCount}
            hint="Only these produce metrics"
          />
          <Stat
            label="Evaluated"
            value={latestRun ? latestRun.predictions.filter((p) => !p.error).length : "—"}
          />
          <Stat label="Avg latency" value={fmtLatency(averageLatency)} />
        </div>
      </section>

      {!latestRun ? (
        <EmptyState
          title="Not evaluated yet"
          description="Run the dataset to produce raw probabilities for every scenario. Thresholds are applied afterwards, so you can explore operating points without re-evaluating."
        />
      ) : (
        <>
          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
              <h2 className="text-[13px] font-medium">Threshold explorer</h2>
              <select
                value={dimension}
                onChange={(event) => setDimension(event.target.value as NoulDimension)}
                className="ml-auto rounded-md border border-border bg-surface-2 px-2 py-1 text-[11.5px]"
              >
                {NOUL_DIMENSIONS.map((key) => (
                  <option key={key} value={key} disabled={labelCounts[key] === 0}>
                    {DIMENSION_PRESENTATION[key].label}
                    {labelCounts[key] === 0 ? " (no labels)" : ` (${labelCounts[key]} labelled)`}
                  </option>
                ))}
              </select>
            </div>
            <div className="px-3.5 py-3">
              <ThresholdExplorer dimension={dimension} predictions={explorerPredictions} />
            </div>
          </section>

          {phaseMetrics && (
            <section className="panel overflow-hidden">
              <div className="border-b border-border px-3.5 py-2.5">
                <h2 className="text-[13px] font-medium">Phase (Choice) against labels</h2>
              </div>
              <div className="px-3.5 py-3">
                <p className="text-[12px] text-text-secondary">
                  <span className="num font-medium">{phaseMetrics.correct}</span> of{" "}
                  <span className="num font-medium">{phaseMetrics.labelled}</span> labelled
                  scenarios matched the expected phase
                  {phaseMetrics.accuracy !== null && (
                    <>
                      {" "}
                      (<span className="num">{(phaseMetrics.accuracy * 100).toFixed(0)}%</span>)
                    </>
                  )}
                  .
                </p>
                <ul className="mt-2 space-y-1">
                  {phaseMetrics.confusion
                    .filter((row) => row.expected !== row.predicted)
                    .map((row) => (
                      <li
                        key={`${row.expected}-${row.predicted}`}
                        className="flex items-center gap-2 text-[11.5px] text-text-secondary"
                      >
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full"
                          style={{ background: PHASE_PRESENTATION[row.expected].color }}
                        />
                        labelled {PHASE_PRESENTATION[row.expected].label} → predicted{" "}
                        {PHASE_PRESENTATION[row.predicted].label}
                        <span className="num ml-auto">{row.count}×</span>
                      </li>
                    ))}
                </ul>
              </div>
            </section>
          )}

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-3.5 py-2.5">
              <h2 className="text-[13px] font-medium">Per-scenario results</h2>
              <p className="text-[11px] text-text-muted">
                Raw probabilities. No threshold has been applied to this table.
              </p>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    <th className="label-caps px-3 py-1.5">Scenario</th>
                    <th className="label-caps px-3 py-1.5">Phase</th>
                    {NOUL_DIMENSIONS.map((key) => (
                      <th key={key} className="label-caps px-2 py-1.5 text-right">
                        {DIMENSION_PRESENTATION[key].short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {latestRun.predictions.map((prediction) => (
                    <tr key={prediction.scenarioId} className="border-t border-border">
                      <td className="max-w-[220px] truncate px-3 py-1.5 text-[11.5px]">
                        {prediction.name}
                      </td>
                      <td className="px-3 py-1.5 text-[11.5px] text-text-secondary">
                        {prediction.error ? (
                          <span className="text-[var(--color-status-warning)]">unavailable</span>
                        ) : (
                          <>
                            {prediction.phase && PHASE_PRESENTATION[prediction.phase].label}
                            {prediction.expected?.phase &&
                              prediction.expected.phase !== prediction.phase && (
                                <span className="ml-1 text-[10px] text-[var(--color-status-warning)]">
                                  (labelled {PHASE_PRESENTATION[prediction.expected.phase].label})
                                </span>
                              )}
                          </>
                        )}
                      </td>
                      {NOUL_DIMENSIONS.map((key) => {
                        const value = prediction.nouls?.[key];
                        const label = prediction.expected?.[key];
                        return (
                          <td
                            key={key}
                            className="num px-2 py-1.5 text-right text-[11.5px]"
                            title={
                              typeof label === "boolean"
                                ? `labelled ${label ? "true" : "false"}`
                                : "no label"
                            }
                          >
                            {typeof value === "number" ? fmtProbability(value) : "—"}
                            {typeof label === "boolean" && (
                              <span className="ml-0.5 text-[9px] text-text-muted">
                                {label ? "▲" : "▽"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-3.5 py-2 text-[10.5px] text-text-muted">
              ▲ labelled true · ▽ labelled false · no marker means no label for that dimension
            </div>
          </section>

          <section className="panel overflow-hidden">
            <Disclosure title="Raw run payload">
              <JsonBlock value={latestRun} maxHeight={400} />
            </Disclosure>
          </section>
        </>
      )}
    </>
  );
}
