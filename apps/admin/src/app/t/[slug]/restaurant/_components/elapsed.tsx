"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

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

export function elapsedMinutes(fromIso: string, now: number): number {
  return Math.max(0, (now - new Date(fromIso).getTime()) / 60_000);
}

/** "0:45", "12:03", "1 ชม. 05 น." */
export function formatElapsed(fromIso: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} ชม. ${String(m).padStart(2, "0")} น.`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Colour by age: green < warn, amber < danger, red after. */
export function elapsedTone(minutes: number, warn = 10, danger = 20): "ok" | "warn" | "danger" {
  if (minutes >= danger) return "danger";
  if (minutes >= warn) return "warn";
  return "ok";
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

const TIME_FMT = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const DATE_TIME_FMT = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return TIME_FMT.format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE_TIME_FMT.format(new Date(iso));
}

/** Today in Bangkok (YYYY-MM-DD) */
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
