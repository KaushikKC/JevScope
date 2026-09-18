"use client";

import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/ui";

export function Disclosure({
  title,
  subtitle,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("border-b border-border last:border-b-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
      >
        <ChevronRight
          size={13}
          className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-90")}
        />
        <span className="text-[12px] font-medium">{title}</span>
        {subtitle && <span className="num ml-auto text-[11px] text-text-muted">{subtitle}</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/** Pretty-printed JSON in a scroll box. Values are escaped by React. */
export function JsonBlock({ value, maxHeight = 320 }: { value: unknown; maxHeight?: number }) {
  return (
    <pre
      className="overflow-auto rounded-md border border-border bg-bg p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre text-text-secondary"
      style={{ maxHeight }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
