"use client";

/**
 * The compact per-step card used in the run timeline.
 *
 * It has to convey, in roughly 120px of height: what the agent did, which phase
 * the model read it as, and where the four primary judgments landed — without
 * the reader deciding anything from color alone.
 */

import {
  CheckCircle2,
  FileDown,
  FilePen,
  MessageSquare,
  Play,
  Terminal,
  TestTube2,
  Wrench,
} from "lucide-react";

import {
  DIMENSION_PRESENTATION,
  EVENT_TYPE_LABELS,
  PHASE_PRESENTATION,
  PRIMARY_DIMENSIONS,
} from "@/lib/jev/presentation";
import type { SemanticEvaluationView } from "@/lib/trace/serialize";
import type { TraceStep } from "@/lib/trace/types";
import { cn, fmtLatency, fmtProbability } from "@/lib/ui";

const EVENT_ICONS: Record<string, typeof Play> = {
  message: MessageSquare,
  tool_call: Wrench,
  tool_result: Wrench,
  file_read: FileDown,
  file_write: FilePen,
  shell: Terminal,
  test: TestTube2,
  completion: CheckCircle2,
};

export function EventCard({
  step,
  evaluation,
  selected,
  onSelect,
}: {
  step: TraceStep;
  evaluation: SemanticEvaluationView | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = EVENT_ICONS[step.eventType] ?? Play;
  const phase = evaluation && !evaluation.unavailable ? PHASE_PRESENTATION[evaluation.phase] : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-border-strong bg-surface-2"
          : "border-border bg-surface-1 hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="num text-[10.5px] font-medium text-text-muted">
          STEP {step.index + 1}
        </span>
        <span className="flex items-center gap-1 text-[10.5px] font-medium tracking-wide text-text-secondary">
          <Icon size={11} strokeWidth={2} />
          {EVENT_TYPE_LABELS[step.eventType] ?? step.eventType.toUpperCase()}
        </span>
        {evaluation && !evaluation.unavailable && (
          <span className="num ml-auto text-[10.5px] text-text-muted">
            {fmtLatency(evaluation.latencyMs)}
          </span>
        )}
      </div>

      <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-text-primary">
        {step.toolName ? <span className="text-text-muted">{step.toolName} · </span> : null}
        {step.content}
      </p>

      {evaluation === null ? (
        <p className="mt-2 text-[11px] text-text-muted">not yet evaluated</p>
      ) : evaluation.unavailable ? (
        <p className="mt-2 text-[11px] text-[var(--color-status-warning)]">
          evaluation unavailable
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-[72px] shrink-0 text-[11px] text-text-muted">Phase</span>
            <span className="flex items-center gap-1.5 text-[11.5px]">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: phase?.color }}
              />
              {phase?.label}
            </span>
            <span className="num ml-auto text-[11px] text-text-secondary">
              {Math.round(evaluation.phaseConfidence * 100)}%
            </span>
          </div>

          <div className="mt-1.5 space-y-[3px]">
            {PRIMARY_DIMENSIONS.map((dimension) => {
              const meta = DIMENSION_PRESENTATION[dimension];
              const value = evaluation.nouls[dimension];
              return (
                <div key={dimension} className="flex items-center gap-2">
                  <span className="w-[72px] shrink-0 text-[11px] text-text-muted">
                    {meta.short}
                  </span>
                  <Blocks value={value} color={meta.colorVar} />
                  <span className="num ml-auto text-[11px] text-text-secondary">
                    {fmtProbability(value)}
                  </span>
                </div>
              );
            })}
          </div>

          {evaluation.source === "mock" && (
            <p className="mt-2 text-[10.5px] text-[var(--color-status-warning)]">
              mock value — not a Jev result
            </p>
          )}
        </>
      )}
    </button>
  );
}

/**
 * A ten-cell bar. Discrete blocks rather than a continuous fill: at this size
 * they are easier to compare across stacked rows, and they make the printed
 * value the authority rather than a pixel width.
 */
function Blocks({ value, color }: { value: number; color: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 10);
  return (
    <span aria-hidden className="flex gap-[2px]">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="h-[7px] w-[7px] rounded-[1.5px]"
          style={{ background: i < filled ? color : "var(--color-surface-3)" }}
        />
      ))}
    </span>
  );
}
