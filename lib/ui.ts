import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Probabilities are shown to two decimals, without a leading zero: .94, 1.00. */
export function fmtProbability(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1) return "1.00";
  return value.toFixed(2).replace(/^0/, "");
}

/** Signed delta, same convention. */
export function fmtDelta(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(3).replace(/^0/, "")}`;
}

export function fmtLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Timestamp formatting.
 *
 * `timeZone` is a parameter rather than an implicit default because the server
 * and the browser sit in different zones: rendering "whatever this machine
 * thinks local is" on both sides guarantees a hydration mismatch. Server
 * rendering passes "UTC" so both agree; `<LocalTime>` re-renders in the
 * viewer's own zone once mounted.
 */
export function fmtTime(value: Date | string | number, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  });
}

export function fmtDateTime(value: Date | string | number, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

export function fmtDuration(start: Date | string, end?: Date | string | null): string {
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((b - a) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
