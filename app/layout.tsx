import type { Metadata } from "next";

import { AppNav } from "@/components/app-nav";
import { hasApiKey } from "@/lib/jev/client";

import "./globals.css";

export const metadata: Metadata = {
  title: "JevScope",
  description:
    "Semantic observability and robustness evaluation for AI agents, powered by TypeSafe Jev.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server so no key material, not even its presence check, runs
  // in the browser.
  const configured = hasApiKey();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <AppNav configured={configured} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
