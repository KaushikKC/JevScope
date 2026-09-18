"use client";

/**
 * The repeatability experiment: the same state, the same questions, N times.
 *
 * Presented as a dot strip per dimension rather than a summary line. The mean
 * and standard deviation are there, but seeing five points sitting on top of
 * each other versus scattered across a third of the scale is the finding.
 */

import { DIMENSION_PRESENTATION, PHASE_PRESENTATION } from "@/lib/jev/presentation";
import { NOUL_DIMENSIONS } from "@/lib/jev/types";
import type { Distribution, RepeatabilityReport } from "@/lib/metrics/stats";
import { fmtLatency, fmtProbability } from "@/lib/ui";

export function RepeatabilityView({ report }: { report: RepeatabilityReport }) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="label-caps mb-2">Noul spread across {report.repeats} identical requests</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="label-caps px-2 py-1.5">Judgment</th>
                <th className="label-caps px-2 py-1.5">Values</th>
                <th className="label-caps px-2 py-1.5 text-right">Mean</th>
                <th className="label-caps px-2 py-1.5 text-right">SD</th>
                <th className="label-caps px-2 py-1.5 text-right">Range</th>
              </tr>
            </thead>
            <tbody>
              {NOUL_DIMENSIONS.map((dimension) => {
                const distribution = report.nouls[dimension];
                const meta = DIMENSION_PRESENTATION[dimension];
                return (
                  <tr key={dimension} className="border-b border-border/60">
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full"
                          style={{ background: meta.colorVar }}
                        />
                        <span className="text-[11.5px]">{meta.short}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <DotStrip distribution={distribution} color={meta.colorVar} />
                    </td>
                    <td className="num px-2 py-1.5 text-right text-[11.5px]">
                      {fmtProbability(distribution.mean)}
                    </td>
                    <td className="num px-2 py-1.5 text-right text-[11.5px] text-text-secondary">
                      {distribution.standardDeviation.toFixed(3).replace(/^0/, "")}
                    </td>
                    <td className="num px-2 py-1.5 text-right text-[11.5px] text-text-secondary">
                      {distribution.range.toFixed(3).replace(/^0/, "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10.5px] text-text-muted">
          Each dot is one request. The strip spans 0 to 1, so a tight cluster means the judgment is
          reproducible on this state. Standard deviation is the sample (n−1) form.
        </p>
      </section>

      <section>
        <h3 className="label-caps mb-2">Phase agreement</h3>
        <div className="panel p-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-[13px]">
              Modal phase{" "}
              <span className="font-medium">
                {PHASE_PRESENTATION[report.choice.modalPhase].label}
              </span>
            </span>
            <span className="num text-[12px] text-text-secondary">
              {Math.round(report.choice.agreement * 100)}% agreement
            </span>
            <span className="text-[11.5px] text-text-muted">
              {report.choice.distinctWinners} distinct winner
              {report.choice.distinctWinners === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-2.5 space-y-1">
            {Object.entries(report.choice.wins)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([phase, count]) => (
                <div key={phase} className="flex items-center gap-2">
                  <span className="w-[92px] shrink-0 text-[11.5px] text-text-secondary">
                    {PHASE_PRESENTATION[phase as keyof typeof PHASE_PRESENTATION].label}
                  </span>
                  <span className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${(count / report.repeats) * 100}%`,
                        background:
                          PHASE_PRESENTATION[phase as keyof typeof PHASE_PRESENTATION].color,
                      }}
                    />
                  </span>
                  <span className="num w-[52px] shrink-0 text-right text-[11px] text-text-muted">
                    {count}/{report.repeats}
                  </span>
                </div>
              ))}
          </div>

          <div className="mt-3 border-t border-border pt-2.5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-text-secondary">
              <span>
                Confidence mean{" "}
                <span className="num">{fmtProbability(report.choice.confidence.mean)}</span>
              </span>
              <span>
                Confidence SD{" "}
                <span className="num">
                  {report.choice.confidence.standardDeviation.toFixed(3).replace(/^0/, "")}
                </span>
              </span>
              <span>
                Latency mean <span className="num">{fmtLatency(report.latencyMs.mean)}</span>
              </span>
              <span>
                Latency range{" "}
                <span className="num">
                  {fmtLatency(report.latencyMs.min)}–{fmtLatency(report.latencyMs.max)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DotStrip({ distribution, color }: { distribution: Distribution; color: string }) {
  return (
    <span
      className="relative flex h-4 w-[160px] items-center rounded-sm bg-surface-3"
      role="img"
      aria-label={`${distribution.n} values, mean ${fmtProbability(distribution.mean)}, range ${distribution.range.toFixed(3)}`}
    >
      {/* Range bar behind the points, so a wide spread reads before the dots do. */}
      <span
        className="absolute inset-y-[6px] rounded-full"
        style={{
          left: `${distribution.min * 100}%`,
          width: `${Math.max(1, distribution.range * 100)}%`,
          background: `color-mix(in oklab, ${color} 30%, transparent)`,
        }}
      />
      {distribution.values.map((value, i) => (
        <span
          key={i}
          className="absolute size-[7px] -translate-x-1/2 rounded-full border-2"
          style={{
            left: `${value * 100}%`,
            background: color,
            borderColor: "var(--color-surface-1)",
          }}
        />
      ))}
    </span>
  );
}
