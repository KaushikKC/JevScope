"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Beaker,
  FlaskConical,
  LayoutDashboard,
  ListTree,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/runs", label: "Runs", icon: ListTree },
  { href: "/decision-lab", label: "Decision Lab", icon: FlaskConical },
  { href: "/evaluations", label: "Evaluations", icon: Beaker },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav({ configured }: { configured: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 flex h-screen w-[208px] shrink-0 flex-col border-r border-border bg-surface-1">
      <div className="px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Sigil />
          <span className="text-[15px] font-semibold tracking-tight">JevScope</span>
        </Link>
        <p className="mt-1 text-[11px] leading-snug text-text-muted">
          Semantic observability
        </p>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-2">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                )}
              >
                <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border px-4 py-3">
        <div className="label-caps">Evaluator</div>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{
              background: configured
                ? "var(--color-status-good)"
                : "var(--color-status-warning)",
            }}
          />
          <span className="text-[12px] text-text-secondary">
            {configured ? "Jev connected" : "Mock mode"}
          </span>
        </div>
        {!configured && (
          <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
            No API key. Judgments are simulated and labelled as such.
          </p>
        )}
      </div>
    </nav>
  );
}

/** A small mark: four stacked signal bars, which is what the product shows. */
function Sigil() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <rect x="1" y="2" width="16" height="2.5" rx="1.25" fill="var(--color-series-1)" />
      <rect x="1" y="6" width="11" height="2.5" rx="1.25" fill="var(--color-series-2)" />
      <rect x="1" y="10" width="6" height="2.5" rx="1.25" fill="var(--color-series-3)" />
      <rect x="1" y="14" width="13" height="2.5" rx="1.25" fill="var(--color-series-4)" />
    </svg>
  );
}
