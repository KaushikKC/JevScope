"use client";

/**
 * DecisionScope Lab.
 *
 * Takes one semantic judgment and asks how much it can be trusted, in two
 * independent ways: change the input in ways that should not matter
 * (perturbations), and change nothing at all (repeatability).
 *
 * The exact transformed input is always displayed. A robustness claim you
 * cannot inspect the inputs of is not a result.
 */

import { useCallback, useMemo, useState } from "react";
import { Download, FlaskConical, RotateCw } from "lucide-react";

import { Disclosure, JsonBlock } from "@/components/ui/disclosure";
import { Badge, Button, EmptyState, Stat } from "@/components/ui/primitives";
import { DEFAULT_LARGE_SHIFT_THRESHOLD, aggregateDrift } from "@/lib/metrics/drift";
import type {
  PerturbationExperimentResult,
  RepeatabilityExperimentResult,
} from "@/lib/experiments/run";
import { PERTURBATION_INFO, PERTURBATION_KINDS, type PerturbationKind } from "@/lib/perturbations";
import { cn, fmtDelta, fmtLatency, fmtProbability } from "@/lib/ui";

import { DriftBars, DriftMatrix } from "./drift-matrix";
import { RepeatabilityView } from "./repeatability-view";

export interface LabStep {
  id: string;
  runId: string;
  runName: string;
  task: string;
  index: number;
  eventType: string;
  content: string;
}

const REPEAT_OPTIONS = [1, 5, 10, 25] as const;
const DEFAULT_SEED = 42;

export function DecisionLab({
  steps,
  initialStepId,
}: {
  steps: LabStep[];
  initialStepId?: string;
}) {
  const [stepId, setStepId] = useState(initialStepId ?? steps[0]?.id ?? "");
  const [selectedKinds, setSelectedKinds] = useState<PerturbationKind[]>([
    "paraphrase",
    "typoNoise",
    "irrelevantContext",
    "adversarialInstruction",
  ]);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [historyWindow, setHistoryWindow] = useState(8);
  const [truncationKeep, setTruncationKeep] = useState(3);
  const [threshold, setThreshold] = useState(DEFAULT_LARGE_SHIFT_THRESHOLD);
  const [repeats, setRepeats] = useState<(typeof REPEAT_OPTIONS)[number]>(10);

  const [perturbation, setPerturbation] = useState<PerturbationExperimentResult | null>(null);
  const [repeatability, setRepeatability] = useState<RepeatabilityExperimentResult | null>(null);
  const [busy, setBusy] = useState<"perturbation" | "repeat" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step = steps.find((candidate) => candidate.id === stepId);

  const runPerturbations = useCallback(async () => {
    if (!stepId || selectedKinds.length === 0) return;
    setBusy("perturbation");
    setError(null);
    try {
      const response = await fetch("/api/decision-lab/perturbations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stepId,
          historyWindow,
          perturbations: selectedKinds.map((kind) => ({
            kind,
            seed,
            ...(kind === "historyTruncation" ? { keep: truncationKeep } : {}),
          })),
        }),
      });
      if (!response.ok) throw new Error(`Experiment failed (HTTP ${response.status}).`);
      setPerturbation((await response.json()) as PerturbationExperimentResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Experiment failed.");
    } finally {
      setBusy(null);
    }
  }, [historyWindow, seed, selectedKinds, stepId, truncationKeep]);

  const runRepeats = useCallback(async () => {
    if (!stepId) return;
    setBusy("repeat");
    setError(null);
    try {
      const response = await fetch("/api/decision-lab/repeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId, repeats, historyWindow }),
      });
      if (!response.ok) throw new Error(`Experiment failed (HTTP ${response.status}).`);
      setRepeatability((await response.json()) as RepeatabilityExperimentResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Experiment failed.");
    } finally {
      setBusy(null);
    }
  }, [historyWindow, repeats, stepId]);

  const aggregate = useMemo(() => {
    const comparisons = perturbation?.perturbations
      .map((entry) => entry.comparison)
      .filter((comparison): comparison is NonNullable<typeof comparison> => Boolean(comparison));
    return comparisons?.length ? aggregateDrift(comparisons) : null;
  }, [perturbation]);

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      step: step ?? null,
      settings: { seed, historyWindow, truncationKeep, largeShiftThreshold: threshold },
      perturbationExperiment: perturbation,
      repeatabilityExperiment: repeatability,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jevscope-experiment-${stepId || "step"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (steps.length === 0) {
    return (
      <div className="px-6 py-5">
        <EmptyState
          title="No evaluated steps yet"
          description="The Decision Lab tests the robustness of a judgment that already exists. Create a run from a demo and let it evaluate, then come back."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-1 gap-3 px-6 py-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---- Controls ---- */}
        <aside className="space-y-3">
          <section className="panel p-3.5">
            <h2 className="label-caps mb-2">Step under test</h2>
            <select
              value={stepId}
              onChange={(event) => {
                setStepId(event.target.value);
                setPerturbation(null);
                setRepeatability(null);
              }}
              className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px]"
            >
              {steps.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.runName} · step {candidate.index + 1} · {candidate.eventType}
                </option>
              ))}
            </select>
            {step && (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[11px] text-text-muted">
                  <span className="font-medium text-text-secondary">Task: </span>
                  {step.task}
                </p>
                <p className="line-clamp-3 text-[11.5px] leading-snug text-text-secondary">
                  {step.content}
                </p>
              </div>
            )}
          </section>

          <section className="panel p-3.5">
            <h2 className="label-caps mb-2">Perturbations</h2>
            <div className="space-y-1.5">
              {PERTURBATION_KINDS.map((kind) => {
                const info = PERTURBATION_INFO[kind];
                const checked = selectedKinds.includes(kind);
                return (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedKinds((current) =>
                          current.includes(kind)
                            ? current.filter((value) => value !== kind)
                            : PERTURBATION_KINDS.filter(
                                (value) => current.includes(value) || value === kind,
                              ),
                        )
                      }
                      className="mt-0.5 accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px]">{info.label}</span>
                      <span className="block text-[10.5px] leading-snug text-text-muted">
                        {info.question}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <NumberField
                label="Seed"
                value={seed}
                min={0}
                max={99999}
                onChange={setSeed}
                hint="Fixes every random choice. The same seed reproduces the same transformed input."
              />
              <NumberField
                label="History window"
                value={historyWindow}
                min={0}
                max={20}
                onChange={setHistoryWindow}
                hint="Events included when the original state is built."
              />
              {selectedKinds.includes("historyTruncation") && (
                <NumberField
                  label="Truncate: keep"
                  value={truncationKeep}
                  min={0}
                  max={20}
                  onChange={setTruncationKeep}
                />
              )}
              <NumberField
                label="Large-shift threshold"
                value={threshold}
                min={0}
                max={1}
                step={0.01}
                onChange={setThreshold}
                hint="A display parameter only. It changes what is counted as a large shift, never the measured values."
              />
            </div>

            <Button
              variant="primary"
              className="mt-3 w-full"
              onClick={runPerturbations}
              disabled={busy !== null || selectedKinds.length === 0}
            >
              {busy === "perturbation" ? (
                <>
                  <RotateCw size={12} className="animate-spin" /> Evaluating…
                </>
              ) : (
                <>
                  <FlaskConical size={12} /> Run {selectedKinds.length} perturbation
                  {selectedKinds.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
            <p className="mt-1.5 text-[10.5px] text-text-muted">
              {selectedKinds.length + 2} requests: the original, one control re-run, and each
              perturbation.
            </p>
          </section>

          <section className="panel p-3.5">
            <h2 className="label-caps mb-2">Repeat the same judgment</h2>
            <div className="flex gap-1">
              {REPEAT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRepeats(option)}
                  aria-pressed={repeats === option}
                  className={cn(
                    "num flex-1 rounded-md border px-2 py-1 text-[12px]",
                    repeats === option
                      ? "border-[var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] text-text-primary"
                      : "border-border bg-surface-2 text-text-secondary hover:bg-surface-3",
                  )}
                >
                  {option}×
                </button>
              ))}
            </div>
            <Button
              className="mt-2.5 w-full"
              onClick={runRepeats}
              disabled={busy !== null}
            >
              {busy === "repeat" ? (
                <>
                  <RotateCw size={12} className="animate-spin" /> Running {repeats}…
                </>
              ) : (
                <>Run {repeats} identical request{repeats === 1 ? "" : "s"}</>
              )}
            </Button>
            <p className="mt-1.5 text-[10.5px] leading-snug text-text-muted">
              Identical state, identical questions. Whatever spread appears is the model's own,
              and it is the floor any perturbation drift has to clear.
            </p>
          </section>

          {(perturbation || repeatability) && (
            <Button className="w-full" onClick={exportJson}>
              <Download size={12} /> Export experiment as JSON
            </Button>
          )}
        </aside>

        {/* ---- Results ---- */}
        <div className="min-w-0 space-y-3">
          {error && (
            <p className="panel px-3.5 py-2.5 text-[12px] text-[var(--color-status-critical)]">
              {error}
            </p>
          )}

          {!perturbation && !repeatability && (
            <EmptyState
              title="No experiment run yet"
              description="Pick perturbations and run them, or repeat the same judgment to see how much it moves on its own. Both store their results and can be exported."
            />
          )}

          {perturbation && (
            <PerturbationResults
              result={perturbation}
              aggregate={aggregate}
              threshold={threshold}
            />
          )}

          {repeatability && (
            <section className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                <h2 className="text-[13px] font-medium">Repeatability</h2>
                <Badge tone={repeatability.source === "mock" ? "warning" : "good"}>
                  {repeatability.source === "mock" ? "MOCK" : "JEV"}
                </Badge>
                <span className="num ml-auto text-[11px] text-text-muted">
                  {repeatability.model}
                </span>
              </div>
              <div className="px-3.5 py-3">
                {repeatability.source === "mock" && (
                  <p className="mb-3 text-[11px] text-[var(--color-status-warning)]">
                    Mock mode is deterministic, so this spread is always zero. It measures nothing
                    about Jev.
                  </p>
                )}
                {repeatability.report ? (
                  <RepeatabilityView report={repeatability.report} />
                ) : (
                  <p className="text-[12px] text-text-muted">
                    Every request failed. {repeatability.failures[0]}
                  </p>
                )}
                {repeatability.failures.length > 0 && repeatability.report && (
                  <p className="mt-2 text-[11px] text-[var(--color-status-warning)]">
                    {repeatability.failures.length} of {repeatability.repeats} requests failed and
                    are excluded from these statistics.
                  </p>
                )}
              </div>
              <div className="border-t border-border">
                <Disclosure title="Every individual response">
                  <JsonBlock value={repeatability.samples} maxHeight={360} />
                </Disclosure>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function PerturbationResults({
  result,
  aggregate,
  threshold,
}: {
  result: PerturbationExperimentResult;
  aggregate: ReturnType<typeof aggregateDrift>;
  threshold: number;
}) {
  return (
    <>
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
          <h2 className="text-[13px] font-medium">Robustness summary</h2>
          <Badge tone={result.source === "mock" ? "warning" : "good"}>
            {result.source === "mock" ? "MOCK" : "JEV"}
          </Badge>
          <span className="num ml-auto text-[11px] text-text-muted">{result.model}</span>
        </div>

        {result.source === "mock" && (
          <p className="border-b border-border bg-[color-mix(in_oklab,var(--color-status-warning)_10%,transparent)] px-3.5 py-2 text-[11px] text-[var(--color-status-warning)]">
            These are mock judgments. The drift shown is a property of the hash function, not of
            Jev.
          </p>
        )}

        {aggregate && (
          <div className="grid grid-cols-2 gap-2 p-3.5 sm:grid-cols-5">
            <Stat label="Mean abs. drift" value={fmtProbability(aggregate.meanAbsoluteDrift)} />
            <Stat
              label="Max drift"
              value={fmtProbability(aggregate.maxAbsoluteDrift)}
              hint={aggregate.maxDriftDimension ?? undefined}
            />
            <Stat
              label="Large shifts"
              value={aggregate.largeShifts}
              hint={`> ${fmtProbability(threshold)}`}
            />
            <Stat label="Choice flips" value={aggregate.choiceFlips} />
            <Stat label="Mean Δ latency" value={fmtDelta(aggregate.latencyDeltaMs / 1000) + " s"} />
          </div>
        )}

        {result.control?.comparison && (
          <div className="border-t border-border px-3.5 py-2.5">
            <p className="text-[11.5px] text-text-secondary">
              <span className="font-medium">Control:</span> re-running the unchanged state moved
              the judgments by {fmtProbability(result.control.comparison.summary.meanAbsoluteDrift)}{" "}
              on average
              {result.control.comparison.summary.choiceFlips > 0 && " and flipped the phase"}. Drift
              at or below that level is the model's own variance, not an effect of the
              perturbation.
            </p>
          </div>
        )}
      </section>

      {result.original === null && (
        <p className="panel px-3.5 py-2.5 text-[12px] text-[var(--color-status-critical)]">
          The original state could not be evaluated: {result.originalError}
        </p>
      )}

      {result.perturbations.map((entry, index) => (
        <section key={`${entry.config.kind}-${index}`} className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
            <h3 className="text-[13px] font-medium">
              {PERTURBATION_INFO[entry.config.kind].label}
            </h3>
            <span className="num text-[10.5px] text-text-muted">{entry.description}</span>
            {entry.comparison?.phase.flipped && <Badge tone="critical">phase flip</Badge>}
            {entry.comparison && (
              <span className="num ml-auto text-[11px] text-text-secondary">
                mean Δ {fmtProbability(entry.comparison.summary.meanAbsoluteDrift)} · max Δ{" "}
                {fmtProbability(entry.comparison.summary.maxAbsoluteDrift)}
              </span>
            )}
          </div>

          {entry.error ? (
            <p className="px-3.5 py-3 text-[12px] text-[var(--color-status-warning)]">
              evaluation unavailable — {entry.error}
            </p>
          ) : entry.comparison ? (
            <div className="grid gap-4 px-3.5 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
              <DriftMatrix comparison={entry.comparison} threshold={threshold} />
              <div>
                <h4 className="label-caps mb-2">Difference</h4>
                <DriftBars comparison={entry.comparison} threshold={threshold} />
              </div>
            </div>
          ) : null}

          <div className="border-t border-border">
            <Disclosure title="Exact transformed state sent">
              <JsonBlock value={entry.state} maxHeight={320} />
            </Disclosure>
            {entry.judgment && (
              <Disclosure title="Raw response">
                <JsonBlock value={entry.judgment.raw} maxHeight={320} />
              </Disclosure>
            )}
          </div>
        </section>
      ))}

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-3.5 py-2.5">
          <h3 className="text-[13px] font-medium">Original inputs</h3>
        </div>
        <Disclosure title="Original state" defaultOpen>
          <JsonBlock value={result.originalState} maxHeight={360} />
        </Disclosure>
        <Disclosure title="Questions">
          <JsonBlock value={result.questions} maxHeight={360} />
        </Disclosure>
        {result.original && (
          <Disclosure title="Original raw response">
            <JsonBlock value={result.original.raw} maxHeight={360} />
          </Disclosure>
        )}
      </section>
    </>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between">
        <span className="text-[11.5px] text-text-secondary">{label}</span>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="num w-[72px] rounded border border-border bg-surface-2 px-1.5 py-0.5 text-right text-[11.5px]"
        />
      </span>
      {hint && <span className="mt-0.5 block text-[10px] leading-snug text-text-muted">{hint}</span>}
    </label>
  );
}
