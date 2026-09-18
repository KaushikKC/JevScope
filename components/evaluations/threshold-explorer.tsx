"use client";

/**
 * The threshold explorer.
 *
 * A probability is not a prediction until a threshold turns it into one, and
 * where that threshold belongs depends on what a false positive costs — which
 * is a question about your system, not about the model. So the threshold is a
 * control, it starts at 0.5 rather than at a borrowed 0.8, and every metric on
 * screen is stamped with the value that produced it.
 */

import { useMemo, useState } from "react";

import { DIMENSION_PRESENTATION } from "@/lib/jev/presentation";
import type { NoulDimension } from "@/lib/jev/types";
import { binaryMetrics, bestF1Threshold, type LabelledPrediction } from "@/lib/metrics/classification";
import { fmtProbability } from "@/lib/ui";

export function ThresholdExplorer({
  dimension,
  predictions,
}: {
  dimension: NoulDimension;
  predictions: LabelledPrediction[];
}) {
  const [threshold, setThreshold] = useState(0.5);
  const meta = DIMENSION_PRESENTATION[dimension];

  const metrics = useMemo(
    () => binaryMetrics(predictions, threshold),
    [predictions, threshold],
  );
  const best = useMemo(() => bestF1Threshold(predictions), [predictions]);

  if (predictions.length === 0) {
    return (
      <p className="text-[12px] text-text-muted">
        No scenario in this dataset carries a label for {meta.label}, so no metric can be computed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[260px] flex-1 items-center gap-2.5">
          <span className="text-[11.5px] text-text-secondary">Threshold</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            className="flex-1 accent-[var(--color-accent)]"
            aria-label={`Decision threshold for ${meta.label}`}
          />
          <span className="num w-[38px] text-right text-[12px] font-medium">
            {fmtProbability(threshold)}
          </span>
        </label>
        {best && (
          <button
            type="button"
            onClick={() => setThreshold(best.threshold)}
            className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            title="Fitted on this same data, so it is a starting point to inspect, not a validated operating point."
          >
            Jump to best F1 ({fmtProbability(best.threshold)})
          </button>
        )}
      </div>

      {/* The values themselves, sorted, with the threshold drawn through them —
          so it is visible whether the cut lands in a gap or through a cluster. */}
      <ValueStrip predictions={predictions} threshold={threshold} color={meta.colorVar} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCell label="Precision" value={metrics.precision} />
        <MetricCell label="Recall" value={metrics.recall} />
        <MetricCell label="F1" value={metrics.f1} />
        <MetricCell label="Accuracy" value={metrics.accuracy} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountCell label="True positives" value={metrics.truePositives} />
        <CountCell label="False positives" value={metrics.falsePositives} />
        <CountCell label="True negatives" value={metrics.trueNegatives} />
        <CountCell label="False negatives" value={metrics.falseNegatives} />
      </div>

      <p className="text-[10.5px] leading-relaxed text-text-muted">
        Computed at threshold {fmtProbability(threshold)} over {metrics.labelled} labelled
        scenario{metrics.labelled === 1 ? "" : "s"}. A dash means the metric is undefined here —
        for example, precision with no positive predictions. With this few labels these numbers
        move a lot per scenario; treat them as a smoke test, not a benchmark.
      </p>
    </div>
  );
}

function ValueStrip({
  predictions,
  threshold,
  color,
}: {
  predictions: LabelledPrediction[];
  threshold: number;
  color: string;
}) {
  return (
    <div>
      <div className="relative h-11 rounded-md border border-border bg-bg">
        <div
          className="absolute inset-y-0 w-px bg-[var(--color-accent)]"
          style={{ left: `${threshold * 100}%` }}
          aria-hidden
        />
        {predictions.map((prediction, i) => (
          <span
            key={i}
            className="absolute size-[9px] -translate-x-1/2 rounded-full border-2"
            style={{
              left: `${prediction.probability * 100}%`,
              // Labelled-true on the top row, labelled-false on the bottom:
              // position carries the label, so it is never color-alone.
              top: prediction.expected ? 8 : 26,
              background: prediction.expected ? color : "transparent",
              borderColor: color,
            }}
            title={`${prediction.expected ? "labelled true" : "labelled false"} · ${fmtProbability(prediction.probability)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center gap-4 text-[10.5px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-[9px] rounded-full border-2"
            style={{ background: color, borderColor: color }}
          />
          labelled true (upper row)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-[9px] rounded-full border-2"
            style={{ borderColor: color }}
          />
          labelled false (lower row)
        </span>
        <span className="ml-auto">0 ← probability → 1</span>
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
      <div className="label-caps">{label}</div>
      <div className="num mt-0.5 text-[16px] font-medium">
        {value === null ? <span className="text-text-muted">—</span> : value.toFixed(2)}
      </div>
    </div>
  );
}

function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-1.5">
      <div className="label-caps">{label}</div>
      <div className="num mt-0.5 text-[13px]">{value}</div>
    </div>
  );
}
