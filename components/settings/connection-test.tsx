"use client";

import { useState } from "react";
import { Plug, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import { fmtLatency } from "@/lib/ui";

interface TestResult {
  success: boolean;
  configured: boolean;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  message?: string;
}

/**
 * Runs one tiny evaluation server-side and reports success, model, and latency.
 * The response never contains the key or anything derived from it.
 */
export function ConnectionTest() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/settings/test-connection", { method: "POST" });
      setResult((await response.json()) as TestResult);
    } catch {
      setResult({ success: false, configured: true, message: "The request did not complete." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="primary" onClick={test} disabled={busy}>
        {busy ? (
          <>
            <RotateCw size={12} className="animate-spin" /> Testing…
          </>
        ) : (
          <>
            <Plug size={12} /> Test Jev connection
          </>
        )}
      </Button>

      {result && (
        <div
          className="mt-2.5 rounded-md border px-3 py-2.5"
          style={{
            borderColor: result.success
              ? "color-mix(in oklab, var(--color-status-good) 40%, transparent)"
              : "color-mix(in oklab, var(--color-status-warning) 40%, transparent)",
          }}
        >
          <p
            className="text-[12.5px] font-medium"
            style={{
              color: result.success
                ? "var(--color-status-good)"
                : "var(--color-status-warning)",
            }}
          >
            {result.success ? "Connection succeeded" : "Connection failed"}
          </p>
          {result.success ? (
            <dl className="mt-1.5 grid grid-cols-3 gap-2">
              <Field label="Model" value={result.model ?? "—"} />
              <Field label="Latency" value={fmtLatency(result.latencyMs)} />
              <Field label="Input tokens" value={String(result.inputTokens ?? "—")} />
            </dl>
          ) : (
            <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">
              {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="num text-[12px] text-text-secondary">{value}</dd>
    </div>
  );
}
