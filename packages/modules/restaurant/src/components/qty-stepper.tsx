"use client";

import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

/** 44px touch-target quantity stepper. When `allowRemove` is set, going below 1 calls onRemove (trash icon). */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  size = "md",
  onRemove,
  className,
  label = "จำนวน",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "md" | "lg";
  onRemove?: () => void;
  className?: string;
  label?: string;
}) {
  const btn = cn("flex shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition active:scale-95 disabled:opacity-40", size === "lg" ? "size-12" : "size-11");
  const atMin = value <= min;
  return (
    <div className={cn("inline-flex items-center gap-1", className)} role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={atMin && onRemove ? "ลบรายการ" : "ลดจำนวน"} disabled={atMin && !onRemove} onClick={() => (atMin && onRemove ? onRemove() : onChange(Math.max(min, value - 1)))}>
        {atMin && onRemove ? <Trash2 className="size-4 text-destructive" /> : <Minus className="size-4" />}
      </button>
      <span className={cn("min-w-8 text-center font-semibold tabular-nums", size === "lg" && "min-w-10 text-lg")} aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} aria-label="เพิ่มจำนวน" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}
