import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";
import { RestaurantStyles } from "./styles";

/** Operational progress stepper (server, CSS only): numbered nodes on a line that fills up to the current step. */
export function PickupSteps({ steps, current = 0, className, label = "ขั้นตอนการสั่ง" }: { steps: string[]; current?: number; className?: string; label?: string }) {
  if (!steps.length) return null;
  const pct = steps.length > 1 ? (Math.min(current, steps.length - 1) / (steps.length - 1)) * 100 : 0;
  return (
    <ol aria-label={label} className={cn("relative grid", className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      <RestaurantStyles />
      <span aria-hidden className="absolute top-4 h-0.5 rounded-full bg-border" style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }} />
      <span aria-hidden className="absolute top-4 h-0.5 rounded-full" style={{ left: `${50 / steps.length}%`, width: `calc(${pct}% * ${(steps.length - 1) / steps.length})` }}>
        <span className="rr-step-line block h-full w-full rounded-full bg-primary" />
      </span>
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} aria-current={now ? "step" : undefined} className="relative flex flex-col items-center gap-2 text-center">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold",
                done || now ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground",
                now && "rr-pulse-dot",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className={cn("text-xs leading-snug font-medium sm:text-sm", done || now ? "text-foreground" : "text-muted-foreground")}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
