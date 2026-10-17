import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: "default" | "primary" | "accent" | "success";
  className?: string;
  /** makes the whole card a link (e.g. to the queue the number counts) */
  href?: string;
}) {
  const toneCls = {
    default: "bg-muted text-foreground",
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent-foreground",
    success: "bg-emerald-500/15 text-emerald-700",
  }[tone];
  const body = (
    <>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl sm:size-11", toneCls)}>
        <Icon className="size-4.5 sm:size-5" aria-hidden />
      </span>
      {/* RESPONSIVE (admin_final): in the 2-column phone grids the text column is ~90px wide. Labels wrap (never an
          ellipsis) and, while the column is that narrow, always reserve two lines so the values of cards in the same
          row stay on one baseline. */}
      <div className="@container min-w-0 flex-1">
        <p data-slot="kpi-label" className="text-sm leading-5 text-pretty break-words text-muted-foreground @max-[10rem]:min-h-10">
          {label}
        </p>
        <p data-slot="kpi-value" className="mt-1 font-heading text-xl font-semibold tabular-nums tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} data-slot="kpi-card" className={cn("card flex items-start gap-3 p-4 transition-colors sm:gap-4 sm:p-5 hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
        {body}
      </Link>
    );
  }
  return (
    <div data-slot="kpi-card" className={cn("card flex items-start gap-3 p-4 sm:gap-4 sm:p-5", className)}>
      {body}
    </div>
  );
}
