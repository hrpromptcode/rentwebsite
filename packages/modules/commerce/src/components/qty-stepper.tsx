"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

/** 44px touch-target quantity stepper. `max` null = unlimited (capped at 99). */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max,
  size = "md",
  disabled,
  className,
  label = "จำนวน",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number | null;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const cap = Math.min(99, max ?? 99);
  const btn = cn("flex shrink-0 items-center justify-center text-foreground transition hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent", size === "md" ? "size-11" : "size-11 md:size-10"); // RA-10: 44px touch targets on phones
  return (
    <div className={cn("inline-flex items-center overflow-hidden rounded-[var(--radius-md)] border bg-background", className)} role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label="ลดจำนวน">
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className={cn(
          "w-12 border-x bg-transparent text-center text-base font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          size === "md" ? "h-11" : "h-11 md:h-10",
        )}
        value={value}
        min={min}
        max={cap}
        disabled={disabled}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(cap, Math.max(min, n)));
        }}
        aria-label={label}
      />
      <button type="button" className={btn} onClick={() => onChange(Math.min(cap, value + 1))} disabled={disabled || value >= cap} aria-label="เพิ่มจำนวน">
        <Plus className="size-4" />
      </button>
    </div>
  );
}
