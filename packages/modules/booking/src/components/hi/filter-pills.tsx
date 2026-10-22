"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";

export interface PillItem {
  href: string;
  label: string;
  active: boolean;
  /** small count after the label */
  count?: number;
  /** optional leading avatar image */
  avatar?: string | null;
}

/**
 * Filter chips with a sliding active pill (§5.0 listing pages). Server navigation (Links with ?query) re-renders the page;
 * this client component keeps its instance, so the shared-layout pill glides from the old chip to the new one.
 * `aria-current="page"` marks the active chip. 44px targets; horizontal swipe on phones.
 */
export function FilterPills({ items, ariaLabel, id, tone = "solid", className }: { items: PillItem[]; ariaLabel: string; id: string; tone?: "solid" | "soft"; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id={id}>
      <div className={cn("bk-pills -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0", className)}>
        <nav aria-label={ariaLabel} className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
          {items.map((it, i) => (
            <Link
              key={`${i}-${it.href}`}
              href={it.href}
              scroll={false}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors duration-300",
                it.avatar && "pl-1.5",
                it.active ? (tone === "solid" ? "text-primary-foreground" : "text-primary-ink") : "text-foreground/80 hover:text-foreground",
              )}
            >
              {it.active && (
                <motion.span
                  layoutId="pill"
                  aria-hidden
                  className={cn("absolute inset-0 -z-0 rounded-full", tone === "solid" ? "bg-primary shadow-[0_10px_30px_-12px_var(--primary)]" : "bg-primary-soft ring-1 ring-primary/40")}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              {!it.active && <span aria-hidden className="absolute inset-0 rounded-full border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] transition-colors hover:border-primary/50" />}
              {it.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.avatar} alt="" className="relative size-8 rounded-full object-cover" loading="lazy" />
              )}
              <span className="relative">{it.label}</span>
              {typeof it.count === "number" && <span className={cn("relative font-mono text-[0.6875rem] tabular-nums", it.active ? "opacity-80" : "text-muted-foreground")}>{it.count}</span>}
            </Link>
          ))}
        </nav>
      </div>
    </LayoutGroup>
  );
}
