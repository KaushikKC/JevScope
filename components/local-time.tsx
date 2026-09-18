"use client";

import { useEffect, useState } from "react";

import { fmtDateTime, fmtTime } from "@/lib/ui";

/**
 * A timestamp rendered in the viewer's own timezone.
 *
 * The server has no way to know that zone, so the first render — server and
 * client hydration alike — uses UTC, which both agree on. After mount the
 * component re-renders in the local zone. That ordering is what keeps this free
 * of hydration warnings: the mismatch never happens, rather than being
 * suppressed after the fact.
 */
export function LocalTime({
  value,
  format = "datetime",
}: {
  value: string | number | Date;
  format?: "time" | "datetime";
}) {
  const [local, setLocal] = useState(false);

  useEffect(() => setLocal(true), []);

  const zone = local ? undefined : "UTC";
  const text = format === "time" ? fmtTime(value, zone) : fmtDateTime(value, zone);
  const iso = new Date(value).toISOString();

  return (
    <time dateTime={iso} title={local ? iso : undefined}>
      {text}
      {!local && format === "time" ? " UTC" : ""}
    </time>
  );
}
