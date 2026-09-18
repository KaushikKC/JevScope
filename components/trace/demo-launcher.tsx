"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import type { TraceRun } from "@/lib/trace/types";

export interface DemoSummary {
  key: string;
  name: string;
  task: string;
  hypothesis: string;
  stepCount: number;
}

/**
 * Creates a run from a fixture and navigates to it. The events themselves are
 * ingested from the Run Viewer, through the public API, so what you watch is
 * the real path.
 */
export function DemoLauncher({ demos }: { demos: DemoSummary[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(demoKey: string) {
    setPending(demoKey);
    setError(null);
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoKey }),
      });
      if (!response.ok) throw new Error(`Could not create the run (HTTP ${response.status}).`);
      const { run } = (await response.json()) as { run: TraceRun };
      router.push(`/runs/${run.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the demo.");
      setPending(null);
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[13px] font-medium">Built-in demos</h2>
        <p className="text-[11.5px] text-text-muted">
          Fixture traces, evaluated live. No judgment below is hard-coded.
        </p>
      </div>

      {error && (
        <p className="mb-2 text-[11.5px] text-[var(--color-status-critical)]">{error}</p>
      )}

      <div className="grid gap-2 md:grid-cols-3">
        {demos.map((demo) => (
          <article key={demo.key} className="panel flex flex-col p-3.5">
            <h3 className="text-[13px] font-medium">{demo.name}</h3>
            <p className="mt-1 text-[12px] leading-snug text-text-secondary">{demo.task}</p>
            <p className="mt-2 flex-1 text-[11px] leading-relaxed text-text-muted">
              <span className="font-medium text-text-secondary">Hypothesis: </span>
              {demo.hypothesis}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="num text-[11px] text-text-muted">{demo.stepCount} events</span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => start(demo.key)}
                disabled={pending !== null}
              >
                <Play size={11} />
                {pending === demo.key ? "Creating…" : "Create run"}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
