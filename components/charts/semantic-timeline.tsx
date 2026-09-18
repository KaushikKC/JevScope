"use client";

/**
 * The semantic trace: every judgment plotted against agent step.
 *
 * This is the screen's reason for existing. The question it has to answer at a
 * glance is "when did this agent start going wrong?", so:
 *  - X is the step index, not wall-clock time. Agents idle unevenly; step order
 *    is what the judgments are about.
 *  - Y is fixed to 0..1 for every series. These are probabilities from the same
 *    scale, so a shared axis is meaningful — and a second y-axis never is.
 *  - Clicking anywhere selects that step, tying the chart to the timeline and
 *    the detail panes.
 *
 * Color carries series identity only, assigned in fixed order. Hiding a series
 * never repaints the others.
 */

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  DIMENSION_PRESENTATION,
  PRIMARY_DIMENSIONS,
  SECONDARY_DIMENSIONS,
} from "@/lib/jev/presentation";
import type { NoulDimension } from "@/lib/jev/types";
import { cn, fmtProbability } from "@/lib/ui";

export interface TimelinePoint {
  step: number;
  stepId: string;
  eventType: string;
  phase: string | null;
  unavailable: boolean;
  values: Partial<Record<NoulDimension, number>>;
}

export function SemanticTimeline({
  points,
  selectedStepId,
  onSelectStep,
}: {
  points: TimelinePoint[];
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
}) {
  const [visible, setVisible] = useState<NoulDimension[]>(PRIMARY_DIMENSIONS);
  const [showTable, setShowTable] = useState(false);

  const data = useMemo(
    () =>
      points.map((point) => ({
        step: point.step,
        stepId: point.stepId,
        eventType: point.eventType,
        phase: point.phase,
        unavailable: point.unavailable,
        ...point.values,
      })),
    [points],
  );

  const measured = points.filter((point) => !point.unavailable);
  const selectedIndex = points.find((point) => point.stepId === selectedStepId)?.step;

  function toggle(dimension: NoulDimension) {
    setVisible((current) =>
      current.includes(dimension)
        ? current.filter((value) => value !== dimension)
        : // Re-added in canonical order so legend order never depends on clicks.
          [...PRIMARY_DIMENSIONS, ...SECONDARY_DIMENSIONS].filter(
            (value) => current.includes(value) || value === dimension,
          ),
    );
  }

  if (measured.length === 0) {
    return (
      <div className="panel flex h-[260px] items-center justify-center">
        <p className="text-[12.5px] text-text-muted">
          No evaluations yet. Ingest steps to plot the semantic trace.
        </p>
      </div>
    );
  }

  return (
    <section className="panel overflow-hidden" aria-label="Semantic trace over agent steps">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <div>
          <h2 className="text-[13px] font-medium">Semantic trace</h2>
          <p className="text-[11px] text-text-muted">
            Probability per judgment, by agent step. Click a point to inspect the step.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((value) => !value)}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          aria-pressed={showTable}
        >
          {showTable ? "Hide values" : "Show values"}
        </button>
      </div>

      {/* Legend doubles as the series toggle, so identity is never color alone. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-border px-3.5 py-2.5">
        {[...PRIMARY_DIMENSIONS, ...SECONDARY_DIMENSIONS].map((dimension) => {
          const meta = DIMENSION_PRESENTATION[dimension];
          const on = visible.includes(dimension);
          return (
            <button
              key={dimension}
              type="button"
              onClick={() => toggle(dimension)}
              aria-pressed={on}
              title={meta.highMeans}
              className={cn(
                "flex items-center gap-1.5 text-[11.5px] transition-opacity",
                on ? "text-text-primary" : "text-text-muted opacity-60 hover:opacity-100",
              )}
            >
              <span
                aria-hidden
                className="h-[3px] w-3.5 rounded-full"
                style={{ background: on ? meta.colorVar : "var(--color-border-strong)" }}
              />
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="h-[300px] w-full px-1 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 4, left: -18 }}
            onClick={(event) => {
              // Recharts reports the active index; the row it refers to is ours.
              const index = event?.activeIndex;
              const row = typeof index === "number" ? data[index] : undefined;
              if (row?.stepId) onSelectStep?.(row.stepId);
            }}
            style={{ cursor: onSelectStep ? "pointer" : "default" }}
          >
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="step"
              tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
              stroke="var(--color-border)"
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
              stroke="var(--color-border)"
              tickLine={false}
              tickFormatter={(value: number) => fmtProbability(value)}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
              content={<TimelineTooltip visible={visible} />}
            />
            {selectedIndex !== undefined && (
              <ReferenceLine
                x={selectedIndex}
                stroke="var(--color-text-muted)"
                strokeDasharray="3 3"
              />
            )}
            {visible.map((dimension) => (
              <Line
                key={dimension}
                type="monotone"
                dataKey={dimension}
                name={DIMENSION_PRESENTATION[dimension].label}
                stroke={DIMENSION_PRESENTATION[dimension].colorVar}
                strokeWidth={2}
                dot={{ r: 2.5, strokeWidth: 0, fill: DIMENSION_PRESENTATION[dimension].colorVar }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-surface-1)" }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showTable && <ValueTable points={points} visible={visible} />}
    </section>
  );
}

function TimelineTooltip({
  active,
  payload,
  label,
  visible,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: Record<string, unknown> }>;
  label?: number | string;
  visible: NoulDimension[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, unknown> | undefined;

  return (
    <div className="rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 shadow-lg">
      <div className="flex items-baseline gap-2">
        <span className="num text-[11.5px] font-medium">Step {label}</span>
        <span className="text-[10.5px] text-text-muted">{String(row?.eventType ?? "")}</span>
      </div>
      {row?.phase ? (
        <div className="mt-0.5 text-[10.5px] text-text-secondary">phase: {String(row.phase)}</div>
      ) : null}
      <div className="mt-1.5 space-y-0.5">
        {visible.map((dimension) => {
          const value = row?.[dimension];
          if (typeof value !== "number") return null;
          return (
            <div key={dimension} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-[3px] w-3 rounded-full"
                style={{ background: DIMENSION_PRESENTATION[dimension].colorVar }}
              />
              <span className="text-[11px] text-text-secondary">
                {DIMENSION_PRESENTATION[dimension].label}
              </span>
              <span className="num ml-auto text-[11px]">{fmtProbability(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The accessible table view of exactly what is plotted. */
function ValueTable({
  points,
  visible,
}: {
  points: TimelinePoint[];
  visible: NoulDimension[];
}) {
  return (
    <div className="max-h-[260px] overflow-auto border-t border-border">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            <th className="label-caps px-3 py-1.5">Step</th>
            <th className="label-caps px-3 py-1.5">Phase</th>
            {visible.map((dimension) => (
              <th key={dimension} className="label-caps px-3 py-1.5 text-right">
                {DIMENSION_PRESENTATION[dimension].short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.stepId} className="border-t border-border">
              <td className="num px-3 py-1 text-[11.5px]">{point.step}</td>
              <td className="px-3 py-1 text-[11.5px] text-text-secondary">
                {point.unavailable ? "unavailable" : (point.phase ?? "—")}
              </td>
              {visible.map((dimension) => {
                const value = point.values[dimension];
                return (
                  <td key={dimension} className="num px-3 py-1 text-right text-[11.5px]">
                    {typeof value === "number" ? fmtProbability(value) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
