import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: "default" | "primary" | "accent" | "success";
  className?: string;
}) {
  const toneCls = {
    default: "bg-muted text-foreground",
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent-foreground",
    success: "bg-emerald-500/15 text-emerald-700",
  }[tone];
  return (
    <div className={cn("card flex items-start gap-4 p-5", className)}>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", toneCls)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
