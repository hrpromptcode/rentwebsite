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
  /** odometer = rolling accent-font digits (marketing pages), tiles = boxed units, inline = one text line */
  variant?: "odometer" | "tiles" | "inline";
  /** light text on a photo */
  dark?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Rolling digits (odometer): each character is a 0–9 column translated to its value, so a ticking second rolls.
 * Keyed from the right so a shrinking day count keeps its cells. Decorative (aria-hidden): the timer's text lives in
 * the parent's sr-only copy. Dashes until mounted, so the server HTML never disagrees with the client clock.
 */
function Roll({ value, min = 2 }: { value: number | null; min?: number }) {
  if (value === null)
    return (
      <span className="ev-roll" aria-hidden>
        {Array.from({ length: min }, (_, i) => (
          <span key={i} className="ev-roll-dash">
            –
          </span>
        ))}
      </span>
    );
  const s = String(Math.max(0, value)).padStart(min, "0");
  return (
    <span className="ev-roll" aria-hidden>
      {[...s].map((ch, i) => (
        <span key={s.length - i} className="ev-roll-cell">
          <span className="ev-roll-col" style={{ "--d": ch } as React.CSSProperties}>
            {DIGITS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Days / hours / minutes / seconds until `to`. Renders dashes until mounted so the server HTML never disagrees with the
 * client clock; switches to "กำลังจัดงานอยู่ตอนนี้" / "จบงานแล้ว" past the start / end.
 */
export function Countdown({ to, endsAt, variant = "odometer", dark, size = "md", className }: CountdownProps) {
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
      <p className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium", dark ? "border-white/30 bg-white/10 text-white backdrop-blur" : "border-border bg-muted text-foreground", className)} data-testid="countdown" data-phase={phase}>
        {phase === "during" && <span aria-hidden className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" /><span className="relative inline-flex size-2.5 rounded-full bg-primary" /></span>}
        {phase === "after" && <Clock className="size-4" aria-hidden />} {phase === "during" ? L.happeningNow : L.ended}
      </p>
    );
  }

  const parts: Array<[number | null, string]> = [
    [d, L.days],
    [h, L.hours],
    [m, L.minutes],
    [s, L.seconds],
  ];
  const srText = diff === null ? L.startsIn : `${L.startsIn} ${d} ${L.days} ${h} ${L.hours} ${m} ${L.minutes}`;

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

  if (variant === "tiles") {
    return (
      <div className={cn("inline-grid grid-cols-4 gap-2 sm:gap-3", className)} data-testid="countdown" data-phase={phase} role="timer" aria-label={L.startsIn}>
        {parts.map(([v, label]) => (
          <div key={label} className={cn("flex min-w-[64px] flex-col items-center rounded-[var(--radius-lg)] px-2 py-2.5 sm:min-w-[80px] sm:py-3", dark ? "border border-white/20 bg-white/10 text-white backdrop-blur" : "border border-border bg-card text-foreground shadow-sm")}>
            <span className="ev-num text-2xl font-semibold sm:text-4xl">
              <Roll value={v} min={label === L.days ? 1 : 2} />
            </span>
            <span className={cn("mt-1.5 text-[11px] font-medium sm:text-xs", dark ? "text-white/70" : "text-muted-foreground")}>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  // odometer: big rolling accent digits, thin colons, Thai unit labels underneath
  const digitSize = size === "lg" ? "text-[clamp(2.75rem,1.9rem+3vw,4.75rem)]" : size === "sm" ? "text-2xl sm:text-3xl" : "text-[clamp(2rem,1.5rem+1.8vw,3.25rem)]";
  return (
    <div className={cn("ev-count", dark ? "text-white" : "text-foreground", className)} data-testid="countdown" data-phase={phase} role="timer" aria-label={L.startsIn}>
      <span className="sr-only">{srText}</span>
      {parts.map(([v, label], i) => (
        <React.Fragment key={label}>
          {i > 0 && <span aria-hidden className={cn("ev-count-sep", digitSize)} />}
          <span className="ev-count-unit" aria-hidden>
            <span className={cn("ev-num font-bold", digitSize, i === 3 && "text-primary")}>
              <Roll value={v} min={label === L.days ? 2 : 2} />
            </span>
            <span className={cn("text-[11px] font-medium tracking-[0.02em] sm:text-xs", dark ? "text-white/65" : "text-muted-foreground")}>{label}</span>
          </span>
        </React.Fragment>
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
    <p className={cn("inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium tabular-nums", left === 0 ? "bg-destructive/10 text-destructive" : urgent ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-primary-soft text-primary-ink", className)} role="timer" aria-live="polite" data-testid="hold-countdown">
      <Clock className="size-4" aria-hidden />
      {left === 0 ? L.holdExpired : (
        <>
          {L.holdExpiresIn} <span className="font-mono text-[0.95em] font-semibold">{pad(mm)}:{pad(ss)}</span>
        </>
      )}
    </p>
  );
}
