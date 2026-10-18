"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

function useNow(active: boolean, everyMs = 1000): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return now;
}

export interface CountdownProps {
  /** ISO instant the event / session starts */
  to: string;
  /** ISO instant it ends (shows "กำลังจัดงาน" in between) */
  endsAt?: string | null;
  variant?: "tiles" | "inline";
  /** light text on a photo */
  dark?: boolean;
  className?: string;
}

/**
 * Days / hours / minutes / seconds until `to`. Renders dashes until mounted so the server HTML never disagrees with the
 * client clock; switches to "กำลังจัดงานอยู่ตอนนี้" / "จบงานแล้ว" past the start / end.
 */
export function Countdown({ to, endsAt, variant = "tiles", dark, className }: CountdownProps) {
  const start = React.useMemo(() => new Date(to).getTime(), [to]);
  const end = React.useMemo(() => (endsAt ? new Date(endsAt).getTime() : null), [endsAt]);
  const now = useNow(true);
  const diff = now === null ? null : start - now;
  const phase = now === null ? "pending" : diff! > 0 ? "before" : end && now < end ? "during" : "after";
  const d = diff === null ? null : Math.floor(diff / 86_400_000);
  const h = diff === null ? null : Math.floor((diff % 86_400_000) / 3_600_000);
  const m = diff === null ? null : Math.floor((diff % 3_600_000) / 60_000);
  const s = diff === null ? null : Math.floor((diff % 60_000) / 1000);

  if (phase === "during" || phase === "after") {
    return (
      <p className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium", dark ? "border-white/30 bg-white/10 text-white backdrop-blur" : "border-border bg-muted text-foreground", className)} data-testid="countdown" data-phase={phase}>
        <Clock className="size-4" aria-hidden /> {phase === "during" ? L.happeningNow : L.ended}
      </p>
    );
  }

  const parts: Array<[number | null, string]> = [
    [d, L.days],
    [h, L.hours],
    [m, L.minutes],
    [s, L.seconds],
  ];

  if (variant === "inline") {
    return (
      <p className={cn("inline-flex flex-wrap items-center gap-x-2 text-sm font-medium tabular-nums", dark ? "text-white/90" : "text-foreground", className)} data-testid="countdown" data-phase={phase} aria-live="off">
        <Clock className="size-4 text-primary" aria-hidden />
        <span>{L.startsIn}</span>
        {parts.map(([v, label]) => (
          <span key={label}>
            <span className="font-heading text-base font-semibold">{v === null ? "–" : label === L.days ? v : pad(v)}</span> <span className={dark ? "text-white/70" : "text-muted-foreground"}>{label}</span>
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className={cn("inline-grid grid-cols-4 gap-2 sm:gap-3", className)} data-testid="countdown" data-phase={phase} role="timer" aria-label={L.startsIn}>
      {parts.map(([v, label]) => (
        <div key={label} className={cn("flex min-w-[64px] flex-col items-center rounded-[var(--radius-lg)] px-2 py-2.5 sm:min-w-[80px] sm:py-3", dark ? "border border-white/20 bg-white/10 text-white backdrop-blur" : "border border-border bg-card text-foreground shadow-sm")}>
          <span className="font-heading text-2xl font-semibold tabular-nums leading-none sm:text-4xl">{v === null ? "––" : label === L.days ? v : pad(v)}</span>
          <span className={cn("mt-1.5 text-[11px] font-medium sm:text-xs", dark ? "text-white/70" : "text-muted-foreground")}>{label}</span>
        </div>
      ))}
    </div>
  );
}

/** "เหลือเวลาชำระเงิน 18:42" – refreshes the page once the hold lapses so the order page shows the renew / expired state. */
export function HoldCountdown({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const router = useRouter();
  const end = React.useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const now = useNow(true);
  const left = now === null ? null : Math.max(0, end - now);
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      const t = setTimeout(() => router.refresh(), 1500);
      return () => clearTimeout(t);
    }
  }, [left, router]);
  if (left === null) return null;
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const urgent = left > 0 && left < 3 * 60_000;
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium tabular-nums", left === 0 ? "bg-destructive/10 text-destructive" : urgent ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-primary-soft text-primary", className)} role="timer" aria-live="polite" data-testid="hold-countdown">
      <Clock className="size-4" aria-hidden />
      {left === 0 ? L.holdExpired : `${L.holdExpiresIn} ${pad(mm)}:${pad(ss)}`}
    </p>
  );
}
