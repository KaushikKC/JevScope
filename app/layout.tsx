import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppNav } from "@/components/app-nav";
import { hasApiKey } from "@/lib/jev/client";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "JevScope",
  description:
    "Semantic observability and robustness evaluation for AI agents, powered by TypeSafe Jev.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server so no key material, not even its presence check, runs
  // in the browser.
  const configured = hasApiKey();

  // Stamped into the initial HTML, so the first paint is already the right
  // theme. Absent means "follow the OS", which globals.css handles in CSS.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme}>
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <AppNav configured={configured} theme={theme} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
