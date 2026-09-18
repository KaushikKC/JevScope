"use client";

import { useEffect, useState } from "react";

import { fmtDuration } from "@/lib/ui";

/**
 * Elapsed time for a run.
 *
 * A finished run has two fixed endpoints, so it renders identically on the
 * server and the client and needs no special handling. A *running* one is
 * measured against `Date.now()`, which is necessarily different in the two
 * places — that is a hydration mismatch by construction, not a bug to paper
 * over with `suppressHydrationWarning`. So the live case renders a stable
 * placeholder on the server and starts ticking once mounted.
 */
export function LiveDuration({
  startedAt,
  finishedAt,
}: {
  startedAt: string | Date;
  finishedAt?: string | Date | null;
}) {
  const settled = Boolean(finishedAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (settled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [settled]);

  if (settled) return <>{fmtDuration(startedAt, finishedAt)}</>;
  if (now === null) return <span className="text-text-muted">—</span>;
  return <>{fmtDuration(startedAt, new Date(now))}</>;
}
