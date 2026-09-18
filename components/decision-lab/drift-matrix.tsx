"use client";

/**
 * The result matrix: original vs transformed, with the delta.
 *
 * Deltas are printed, not colored by size — a 0.04 move on `stuck` may matter
 * far more than a 0.12 move on `needsVerification`, and only the reader knows
 * which. The one visual emphasis is a marker on moves past the large-shift
 * threshold, which is stated on screen rather than assumed.
 */

import { DIMENSION_PRESENTATION } from "@/lib/jev/presentation";
import { PHASE_PRESENTATION } from "@/lib/jev/presentation";
import type { DriftComparison } from "@/lib/metrics/drift";
import { cn, fmtDelta, fmtProbability } from "@/lib/ui";

export function DriftMatrix({
  comparison,
  threshold,
}: {
  comparison: DriftComparison;
  threshold: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[380px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="label-caps px-2.5 py-1.5">Judgment</th>
            <th className="label-caps px-2.5 py-1.5 text-right">Original</th>
            <th className="label-caps px-2.5 py-1.5 text-right">Transformed</th>
            <th className="label-caps px-2.5 py-1.5 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {comparison.dimensions.map((row) => {
            const large = row.absoluteDelta > threshold;
            return (
              <tr key={row.dimension} className="border-b border-border/60">
                <td className="px-2.5 py-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ background: DIMENSION_PRESENTATION[row.dimension].colorVar }}
                    />
                    <span className="text-[11.5px]">
                      {DIMENSION_PRESENTATION[row.dimension].label}
                    </span>
                  </span>
                </td>
                <td className="num px-2.5 py-1 text-right text-[11.5px] text-text-secondary">
                  {fmtProbability(row.original)}
                </td>
                <td className="num px-2.5 py-1 text-right text-[11.5px] text-text-secondary">
                  {fmtProbability(row.transformed)}
                </td>
                <td
                  className={cn(
                    "num px-2.5 py-1 text-right text-[11.5px]",
                    large ? "font-semibold text-text-primary" : "text-text-muted",
                  )}
                >
                  {fmtDelta(row.delta)}
                  {large && <span className="ml-1 text-[9px] align-super">▲</span>}
                </td>
              </tr>
            );
          })}

          <tr className="border-b border-border/60 bg-surface-2/40">
            <td className="px-2.5 py-1 text-[11.5px] font-medium">Phase</td>
            <td className="px-2.5 py-1 text-right text-[11.5px]">
              {PHASE_PRESENTATION[comparison.phase.original].label}
            </td>
            <td className="px-2.5 py-1 text-right text-[11.5px]">
              {PHASE_PRESENTATION[comparison.phase.transformed].label}
            </td>
            <td className="px-2.5 py-1 text-right text-[11px]">
              {comparison.phase.flipped ? (
                <span className="font-semibold text-[var(--color-status-critical)]">flip</span>
              ) : (
                <span className="text-text-muted">same</span>
              )}
            </td>
          </tr>

          <tr className="bg-surface-2/40">
            <td className="px-2.5 py-1 text-[11.5px]">Phase confidence</td>
            <td className="num px-2.5 py-1 text-right text-[11.5px] text-text-secondary">
              {fmtProbability(comparison.phase.originalConfidence)}
            </td>
            <td className="num px-2.5 py-1 text-right text-[11.5px] text-text-secondary">
              {fmtProbability(comparison.phase.transformedConfidence)}
            </td>
            <td className="num px-2.5 py-1 text-right text-[11.5px] text-text-muted">
              {fmtDelta(comparison.phase.confidenceDelta)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** A horizontal diverging bar per dimension: direction and size of each move. */
export function DriftBars({
  comparison,
  threshold,
}: {
  comparison: DriftComparison;
  threshold: number;
}) {
  const scale = Math.max(0.2, ...comparison.dimensions.map((d) => d.absoluteDelta));

  return (
    <div className="space-y-1.5">
      {comparison.dimensions.map((row) => {
        const width = (row.absoluteDelta / scale) * 50;
        const positive = row.delta >= 0;
        return (
          <div key={row.dimension} className="flex items-center gap-2">
            <span className="w-[112px] shrink-0 truncate text-[11px] text-text-secondary">
              {DIMENSION_PRESENTATION[row.dimension].short}
            </span>
            <span className="relative h-[8px] flex-1 rounded-sm bg-surface-3">
              {/* Zero line in the middle; bars grow left for a drop, right for a rise. */}
              <span
                aria-hidden
                className="absolute inset-y-[-2px] left-1/2 w-px bg-border-strong"
              />
              <span
                className="absolute inset-y-0 rounded-sm"
                style={{
                  width: `${width}%`,
                  [positive ? "left" : "right"]: "50%",
                  background: DIMENSION_PRESENTATION[row.dimension].colorVar,
                  opacity: row.absoluteDelta > threshold ? 1 : 0.55,
                }}
              />
            </span>
            <span className="num w-[52px] shrink-0 text-right text-[11px] text-text-muted">
              {fmtDelta(row.delta)}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[10.5px] text-text-muted">
        Bars are scaled to the largest move in this comparison ({fmtProbability(scale)}). Solid
        bars exceed the large-shift threshold of {fmtProbability(threshold)}.
      </p>
    </div>
  );
}
