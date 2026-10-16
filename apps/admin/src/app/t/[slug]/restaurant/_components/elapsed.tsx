"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { elapsedMinutes, elapsedTone, formatElapsed } from "./time";

export * from "./time";

/** Ticking clock. Seeded with a server timestamp so SSR and the first client render agree (no hydration mismatch). */
export function useNow(seedIso: string, intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => new Date(seedIso).getTime());
  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Elapsed({ from, now, warn = 10, danger = 20, className, plain }: { from: string; now: number; warn?: number; danger?: number; className?: string; plain?: boolean }) {
  const tone = elapsedTone(elapsedMinutes(from, now), warn, danger);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        !plain && tone === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        !plain && tone === "warn" && "bg-amber-500/20 text-amber-700 dark:text-amber-300",
        !plain && tone === "danger" && "bg-red-500/15 text-red-700 dark:text-red-300",
        plain && "text-muted-foreground",
        className,
      )}
      title="เวลาตั้งแต่รับออเดอร์"
    >
      <Clock className="size-3" aria-hidden />
      {formatElapsed(from, now)}
    </span>
  );
}
