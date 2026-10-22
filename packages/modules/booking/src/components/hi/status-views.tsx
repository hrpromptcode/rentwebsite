import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

/** Animated check (stroke draws in once; static under reduced motion). Decorative. */
export function SuccessCheck({ className, tone = "primary" }: { className?: string; tone?: "primary" | "muted" }) {
  return (
    <span aria-hidden className={cn("bk-check relative inline-flex size-12 shrink-0 items-center justify-center rounded-full", tone === "primary" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground", className)}>
      {tone === "primary" && <span className="bk-ping absolute inset-0 rounded-full bg-primary/40" />}
      <svg viewBox="0 0 24 24" className="relative size-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/**
 * Operational "ticket" frame for confirmations (booking status, course status): a top band, the body, a perforated
 * stub and an optional footer. Calm: no scroll motion, one short fade.
 */
export function StatusTicket({ band, children, footer, className }: { band?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bk-panel bk-float rw-fade overflow-hidden", className)}>
      {band && <div className="relative bg-primary-soft px-5 py-5 md:px-8">{band}</div>}
      <div className="px-5 py-6 md:px-8 md:py-8">{children}</div>
      {footer && (
        <>
          <div aria-hidden className="bk-perf bk-notched" />
          <div className="px-5 py-4 md:px-8">{footer}</div>
        </>
      )}
    </div>
  );
}

/** Label / value rows (dl) for detail cards. */
export function DetailRows({ rows, className }: { rows: Array<{ label: string; value: string; mono?: boolean } | null | false | undefined>; className?: string }) {
  return (
    <dl className={cn("grid gap-x-8 sm:grid-cols-2", className)}>
      {rows.filter(Boolean).map((r) => {
        const row = r as { label: string; value: string; mono?: boolean };
        return (
          <div key={row.label + row.value} className="flex justify-between gap-4 border-b border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] py-3 text-sm sm:block">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={cn("text-right font-medium sm:mt-0.5 sm:text-left", row.mono && "font-mono")}>{row.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
