"use client";

/**
 * Centre pane: what the agent actually did at the selected step.
 *
 * Everything here is ingested content, so everything is rendered as text. Tool
 * arguments are shown as data, never interpreted, and nothing on this screen
 * can cause a command to run.
 */

import { EVENT_TYPE_LABELS } from "@/lib/jev/presentation";
import type { TraceStep } from "@/lib/trace/types";
import { LocalTime } from "@/components/local-time";

import { Badge, RawText } from "@/components/ui/primitives";
import { JsonBlock } from "@/components/ui/disclosure";

export function StepDetail({ step }: { step: TraceStep }) {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-[12px] font-medium">Step {step.index + 1}</span>
          <Badge>{EVENT_TYPE_LABELS[step.eventType] ?? step.eventType}</Badge>
          {step.toolName && <Badge tone="accent">{step.toolName}</Badge>}
          <span className="num ml-auto text-[11px] text-text-muted">
            <LocalTime value={step.timestamp} format="time" />
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <section>
          <h3 className="label-caps mb-1.5">Content</h3>
          <div className="rounded-md border border-border bg-bg p-3">
            <RawText value={step.content} className="text-text-primary" />
          </div>
        </section>

        {step.toolArguments !== undefined && (
          <section>
            <h3 className="label-caps mb-1.5">Tool arguments</h3>
            <JsonBlock value={step.toolArguments} maxHeight={200} />
            <p className="mt-1 text-[10.5px] text-text-muted">
              Displayed as data. JevScope never executes ingested tool calls.
            </p>
          </section>
        )}

        {step.toolResult !== undefined && (
          <section>
            <h3 className="label-caps mb-1.5">Tool result</h3>
            {typeof step.toolResult === "string" ? (
              <div className="max-h-[320px] overflow-auto rounded-md border border-border bg-bg p-3">
                <RawText value={step.toolResult} />
              </div>
            ) : (
              <JsonBlock value={step.toolResult} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
