import * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Odometer } from "@rentweb/ui/motion/odometer";
import { cn } from "@rentweb/ui/lib/utils";
import { Sparkline } from "./sparkline";

/**
 * KPI tile: icon chip + label, a big value, a hint and (optionally) a 14-day sparkline. Values are plain text by default
 * (module pages: QA reads them). `countTo` (a pre-formatted string) rolls the value in with the kit Odometer instead —
 * dashboard only; its DOM text is still the exact final value (sr-only), the rolling digits are CSS-generated.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
  href,
  countTo,
  trend,
  trendLabel,
  cta,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: "default" | "primary" | "accent" | "success";
  className?: string;
  /** makes the whole card a link (e.g. to the queue the number counts) */
  href?: string;
  /** dashboard: formatted final value for the Odometer roll-in (falls back to `value`) */
  countTo?: string;
  /** dashboard: daily values, oldest first; the last one is today */
  trend?: number[] | null;
  /** caption under the sparkline, e.g. "14 วันล่าสุด" */
  trendLabel?: string;
  /** dashboard: footer action label for linked tiles without a trend (keeps the row of tiles visually even) */
  cta?: string;
}) {
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        <span className="adm-kpi-icon" data-tone={tone}>
          <Icon className="size-4" aria-hidden />
        </span>
        {/* RESPONSIVE (admin_final): in the 2-column phone grids the tile is ~165px wide; labels wrap (never an ellipsis) */}
        <p data-slot="kpi-label" className="min-w-0 flex-1 pt-1 text-[13px] leading-5 text-pretty break-words text-muted-foreground">
          {label}
        </p>
        {href && <ArrowUpRight className="adm-kpi-go size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <p data-slot="kpi-value" className="adm-kpi-value mt-3 font-heading font-semibold tabular-nums [overflow-wrap:anywhere]">
        {countTo ? <Odometer value={countTo} duration={1.4} /> : value}
      </p>
      {hint && <p className="mt-1 text-xs text-pretty text-muted-foreground">{hint}</p>}
      {trend && trend.length > 1 ? (
        <div className="adm-kpi-trend mt-auto pt-3" data-tone={tone}>
          <Sparkline uid={`k${hash(label)}`} values={trend} className="h-9 w-full" />
          {trendLabel && <span className="mt-0.5 block text-[11px] text-muted-foreground">{trendLabel}</span>}
        </div>
      ) : href && cta ? (
        <span className="adm-kpi-cta mt-auto" aria-hidden>
          {cta}
          <ArrowRight className="size-3.5" />
        </span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} data-slot="kpi-card" className={cn("adm-kpi card is-link", className)}>
        {body}
      </Link>
    );
  }
  return (
    <div data-slot="kpi-card" className={cn("adm-kpi card", className)}>
      {body}
    </div>
  );
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
