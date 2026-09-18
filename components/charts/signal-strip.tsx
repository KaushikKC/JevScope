"use client";

/**
 * Compact per-step strips for the secondary judgments.
 *
 * These three (needs verification, premature completion, unexpected direction)
 * are usually near-flat with one or two moments that matter. A full line chart
 * would give six lines of mostly-noise; a single-row heat strip puts the
 * interesting cell where the eye finds it, and keeps the main chart legible.
 *
 * Encoding is one hue per dimension, light-to-dark by magnitude: a sequential
 * ramp, because these are magnitudes on a shared 0..1 scale.
 */

import { DIMENSION_PRESENTATION } from "@/lib/jev/presentation";
import type { NoulDimension } from "@/lib/jev/types";
import { cn, fmtProbability } from "@/lib/ui";

import type { TimelinePoint } from "./semantic-timeline";

export function SignalStrips({
  points,
  dimensions,
  selectedStepId,
  onSelectStep,
}: {
  points: TimelinePoint[];
  dimensions: NoulDimension[];
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
}) {
  if (points.length === 0) return null;

  return (
    <section className="panel overflow-hidden" aria-label="Secondary semantic signals by step">
      <div className="border-b border-border px-3.5 py-2.5">
        <h2 className="text-[13px] font-medium">Secondary signals</h2>
        <p className="text-[11px] text-text-muted">
          One cell per step. Darker means a higher probability; hover for the value.
        </p>
      </div>

      <div className="space-y-1.5 px-3.5 py-3">
        {dimensions.map((dimension) => {
          const meta = DIMENSION_PRESENTATION[dimension];
          return (
            <div key={dimension} className="flex items-center gap-2.5">
              <span className="flex w-[128px] shrink-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 rounded-[2px]"
                  style={{ background: meta.colorVar }}
                />
                <span className="truncate text-[11.5px] text-text-secondary">{meta.label}</span>
              </span>
              <div className="flex min-w-0 flex-1 gap-[2px]">
                {points.map((point) => {
                  const value = point.values[dimension];
                  const selected = point.stepId === selectedStepId;
                  return (
                    <button
                      key={point.stepId}
                      type="button"
                      onClick={() => onSelectStep?.(point.stepId)}
                      title={`Step ${point.step} · ${meta.label} ${
                        typeof value === "number" ? fmtProbability(value) : "unavailable"
                      }`}
                      aria-label={`Step ${point.step}, ${meta.label} ${
                        typeof value === "number" ? fmtProbability(value) : "unavailable"
                      }`}
                      className={cn(
                        "h-5 min-w-0 flex-1 rounded-[3px] border transition-[box-shadow]",
                        selected ? "border-text-muted" : "border-transparent",
                      )}
                      style={{
                        background:
                          typeof value === "number"
                            ? // 12%..100% keeps a near-zero cell visible as "measured,
                              // and low" rather than blending into the surface.
                              `color-mix(in oklab, ${meta.colorVar} ${12 + value * 88}%, var(--color-surface-3))`
                            : "repeating-linear-gradient(45deg, var(--color-surface-3) 0 3px, transparent 3px 6px)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3.5 py-2">
        <span className="text-[10.5px] text-text-muted">0</span>
        <span
          aria-hidden
          className="h-[6px] w-20 rounded-full"
          style={{
            background:
              "linear-gradient(to right, var(--color-surface-3), var(--color-text-secondary))",
          }}
        />
        <span className="text-[10.5px] text-text-muted">1</span>
        <span className="ml-3 flex items-center gap-1.5 text-[10.5px] text-text-muted">
          <span
            aria-hidden
            className="h-3 w-4 rounded-[3px]"
            style={{
              background:
                "repeating-linear-gradient(45deg, var(--color-surface-3) 0 3px, transparent 3px 6px)",
            }}
          />
          evaluation unavailable
        </span>
      </div>
    </section>
  );
}
