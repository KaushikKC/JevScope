"use client";

/**
 * Right pane: the semantic evaluation of the selected step, plus the raw
 * material behind it.
 *
 * The raw disclosures are not a debug afterthought. An experiment you cannot
 * reproduce is an anecdote, so the exact state, the exact questions, and the
 * unmodified response are always one click away.
 */

import Link from "next/link";
import { FlaskConical } from "lucide-react";

import {
  DIMENSION_PRESENTATION,
  NOUL_DIMENSIONS,
  PHASE_PRESENTATION,
} from "@/lib/jev/presentation";
import { PHASES } from "@/lib/jev/types";
import type { SemanticEvaluationView } from "@/lib/trace/serialize";
import { fmtLatency, fmtProbability } from "@/lib/ui";

import { Badge, Button } from "@/components/ui/primitives";
import { Disclosure, JsonBlock } from "@/components/ui/disclosure";
import { ProbabilityBar } from "./probability-bar";

export function EvaluationPanel({
  evaluation,
  stepId,
}: {
  evaluation: SemanticEvaluationView | null;
  stepId: string;
}) {
  if (!evaluation) {
    return (
      <div className="px-4 py-6">
        <p className="text-[12px] text-text-muted">
          This step has not been evaluated yet.
        </p>
      </div>
    );
  }

  if (evaluation.unavailable) {
    return (
      <div className="space-y-3 px-4 py-6">
        <p className="text-[13px] font-medium text-[var(--color-status-warning)]">
          evaluation unavailable
        </p>
        <p className="text-[12px] leading-relaxed text-text-secondary">
          The trace event was stored, but the evaluator did not return a judgment. Trace data is
          never discarded because of an evaluator failure.
        </p>
        {evaluation.error && (
          <pre className="rounded-md border border-border bg-bg p-2.5 font-mono text-[11px] whitespace-pre-wrap text-text-muted">
            {evaluation.error}
          </pre>
        )}
      </div>
    );
  }

  const phase = PHASE_PRESENTATION[evaluation.phase];
  const sortedPhases = [...PHASES].sort(
    (a, b) => (evaluation.phaseProbabilities[b] ?? 0) - (evaluation.phaseProbabilities[a] ?? 0),
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-medium">Semantic evaluation</h2>
        {evaluation.source === "mock" ? (
          <Badge tone="warning">MOCK</Badge>
        ) : (
          <Badge tone="good">JEV</Badge>
        )}
        <Link href={`/decision-lab?stepId=${stepId}`} className="ml-auto">
          <Button size="sm" variant="secondary">
            <FlaskConical size={12} />
            Open in Decision Lab
          </Button>
        </Link>
      </div>

      {evaluation.source === "mock" && (
        <p className="border-b border-border bg-[color-mix(in_oklab,var(--color-status-warning)_10%,transparent)] px-4 py-2 text-[11px] leading-snug text-[var(--color-status-warning)]">
          These values are a deterministic hash of the state, not model output. Set
          TYPESAFE_API_KEY to get measured Jev judgments.
        </p>
      )}

      <section className="border-b border-border px-4 py-3">
        <h3 className="label-caps mb-2">Phase (Choice)</h3>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: phase.color }}
          />
          <span className="text-[14px] font-medium">{phase.label}</span>
          <span className="num ml-auto text-[12px] text-text-secondary">
            confidence {fmtProbability(evaluation.phaseConfidence)}
          </span>
        </div>
        <div className="mt-2.5 space-y-1">
          {sortedPhases.map((candidate) => (
            <ProbabilityBar
              key={candidate}
              label={PHASE_PRESENTATION[candidate].label}
              value={evaluation.phaseProbabilities[candidate] ?? 0}
              color={
                candidate === evaluation.phase
                  ? PHASE_PRESENTATION[candidate].color
                  : "var(--color-border-strong)"
              }
            />
          ))}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-text-muted">
          Confidence describes how concentrated this distribution is. It is not a statement that
          the phase is correct.
        </p>
      </section>

      <section className="border-b border-border px-4 py-3">
        <h3 className="label-caps mb-2">Judgments (Noul)</h3>
        <div className="space-y-1.5">
          {NOUL_DIMENSIONS.map((dimension) => {
            const meta = DIMENSION_PRESENTATION[dimension];
            return (
              <div key={dimension} title={meta.highMeans}>
                <ProbabilityBar
                  label={meta.label}
                  value={evaluation.nouls[dimension]}
                  color={meta.colorVar}
                  width={110}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-text-muted">
          Each value is the probability that the answer to that question is yes. A high value is
          not automatically a problem: high progress reads well, high stuck is worth a look.
        </p>
      </section>

      <section className="border-b border-border px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Meta label="Model" value={evaluation.model} />
          <Meta label="Latency" value={fmtLatency(evaluation.latencyMs)} />
          <Meta label="Evaluated" value={new Date(evaluation.createdAt).toLocaleString()} />
          <Meta label="Request ID" value={evaluation.requestId ?? "—"} />
        </dl>
      </section>

      <div className="border-t border-border">
        <Disclosure title="Exact state sent to Jev">
          <JsonBlock value={evaluation.requestState} maxHeight={400} />
        </Disclosure>
        <Disclosure title="Exact questions asked">
          <JsonBlock value={evaluation.requestQuestions} maxHeight={400} />
        </Disclosure>
        <Disclosure title="Raw response">
          <JsonBlock value={evaluation.rawResponse} maxHeight={400} />
          <p className="mt-1.5 text-[10.5px] text-text-muted">
            Stored unmodified. The typed fields above are parsed from this.
          </p>
        </Disclosure>
        <Disclosure title="Parsed evaluation">
          <JsonBlock
            value={{
              nouls: evaluation.nouls,
              phase: evaluation.phase,
              phaseProbabilities: evaluation.phaseProbabilities,
              phaseConfidence: evaluation.phaseConfidence,
              latencyMs: evaluation.latencyMs,
              model: evaluation.model,
              source: evaluation.source,
            }}
            maxHeight={400}
          />
        </Disclosure>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd className="num truncate text-[11.5px] text-text-secondary" title={value}>
        {value}
      </dd>
    </div>
  );
}
