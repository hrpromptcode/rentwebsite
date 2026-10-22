"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";

/** Upcoming / history tabs with a sliding active pill (layoutId; instant under reduced motion). */
export function ScopeTabs({ tabs }: { tabs: Array<{ href: string; label: string; active: boolean }> }) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label="ช่วงเวลา" className="mt-2 grid grid-cols-2 gap-1 rounded-full border border-border bg-muted/60 p-1">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={cn("relative flex h-11 items-center justify-center rounded-full text-sm font-medium transition-colors", t.active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {t.active && <motion.span layoutId="rw-stays-pill" className="absolute inset-0 rounded-full bg-card shadow-sm" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />}
          <span className="relative">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
