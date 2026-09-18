/**
 * Theme constants, shared between server and client.
 *
 * These deliberately live outside the `"use client"` toggle component: a server
 * component importing a value from a client module receives a client-reference
 * proxy rather than the value itself, which silently breaks a cookie lookup.
 */
export type Theme = "light" | "dark";

export const THEME_COOKIE = "jevscope-theme";

export function parseTheme(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}
