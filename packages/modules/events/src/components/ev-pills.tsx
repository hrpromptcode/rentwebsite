"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";

export interface EvPill {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}

/**
 * Filter / scope pills with a sliding active pill (§5.0 listing pages). Server navigation (Links with ?query) re-renders
 * the page; this client component keeps its instance, so the shared-layout pill glides from the old pill to the new
 * one. `aria-current` marks the active pill; 44px targets; horizontal swipe on phones. Pass `testId` for QA hooks.
 */
export function EvPills({ items, ariaLabel, id, size = "md", className, testId, current = "true" }: { items: EvPill[]; ariaLabel: string; id: string; size?: "md" | "lg"; className?: string; testId?: string; current?: "page" | "true" }) {
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id={id}>
      <nav aria-label={ariaLabel} data-testid={testId} className={cn("ev-pills -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
        <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
          {items.map((it, i) => (
            <Link
              key={`${i}-${it.href}`}
              href={it.href}
              scroll={false}
              aria-current={it.active ? current : undefined}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 rounded-full font-medium transition-colors duration-300",
                size === "lg" ? "h-12 px-6 text-[15px]" : "h-11 px-5 text-sm",
                it.active ? "text-primary-foreground" : "text-foreground/80 hover:text-foreground",
              )}
            >
              {it.active ? (
                <motion.span layoutId="pill" aria-hidden className="absolute inset-0 rounded-full bg-primary shadow-[0_10px_30px_-12px_var(--primary)]" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />
              ) : (
                <span aria-hidden className="absolute inset-0 rounded-full border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] transition-colors hover:border-primary/60" />
              )}
              <span className="relative">{it.label}</span>
              {typeof it.count === "number" && <span className={cn("ev-num relative text-[0.75rem]", it.active ? "opacity-80" : "text-muted-foreground")}>{String(it.count).padStart(2, "0")}</span>}
            </Link>
          ))}
        </div>
      </nav>
    </LayoutGroup>
  );
}
