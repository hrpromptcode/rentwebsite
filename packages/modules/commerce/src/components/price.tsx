import * as React from "react";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";

export function salePercent(amount: number, compareAt: number | null | undefined): number | null {
  if (compareAt == null || compareAt <= amount || compareAt <= 0) return null;
  return Math.round(((compareAt - amount) / compareAt) * 100);
}

export function Price({
  amount,
  compareAt,
  className,
  size = "md",
}: {
  amount: number;
  compareAt?: number | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const onSale = compareAt != null && compareAt > amount;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-semibold tabular-nums", size === "lg" ? "text-3xl md:text-4xl" : size === "sm" ? "text-sm" : "text-base", onSale && "text-primary")}>{thb(amount)}</span>
      {onSale && <span className={cn("tabular-nums text-muted-foreground line-through", size === "lg" ? "text-lg" : "text-xs")}>{thb(compareAt!)}</span>}
    </span>
  );
}
