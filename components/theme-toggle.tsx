"use client";

import { Moon, Sun } from "lucide-react";

import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/ui";

/**
 * Theme toggle.
 *
 * The choice lives in a cookie so the server can stamp `data-theme` into the
 * initial HTML: no flash of the wrong theme, no boot script, and no hydration
 * mismatch, because server and client read the same value.
 *
 * When no cookie is set the OS preference is in effect — and the server cannot
 * know it. Rather than guess (which would mismatch on hydration), both icons
 * are rendered and CSS shows the right one. The click handler resolves the
 * current theme from the DOM at runtime, where the answer is actually known.
 */
export function ThemeToggle({ current }: { current?: Theme }) {
  function toggle() {
    const root = document.documentElement;
    const resolved: Theme =
      (root.dataset.theme as Theme | undefined) ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next: Theme = resolved === "dark" ? "light" : "dark";

    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      title="Toggle light and dark theme"
      className={cn(
        "flex size-6 items-center justify-center rounded-md border border-border",
        "text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
      )}
    >
      {/*
        Both are rendered; CSS picks one. `current` is only a hint for the case
        where the server does know, and costs nothing when it doesn't.
      */}
      <span className={current === "dark" ? "contents" : "when-dark"}>
        <Sun size={13} strokeWidth={1.75} />
      </span>
      <span className={current === "dark" ? "hidden" : "when-light"}>
        <Moon size={13} strokeWidth={1.75} />
      </span>
    </button>
  );
}
