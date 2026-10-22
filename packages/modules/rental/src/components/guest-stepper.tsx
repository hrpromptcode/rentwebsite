"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

/** 1…max guests with ≥ 44px −/+ buttons; the value is announced ("2 ท่าน") and flashes briefly when it changes. */
export function GuestStepper({ value, onChange, min = 1, max, id, className, size = "md" }: { value: number; onChange: (n: number) => void; min?: number; max: number; id?: string; className?: string; size?: "sm" | "md" }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btn = cn(
    "rw-press flex shrink-0 items-center justify-center rounded-full border border-border bg-background/70 transition-colors hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-35 disabled:hover:border-border disabled:hover:bg-background/70 disabled:hover:text-inherit",
    size === "sm" ? "size-11" : "size-12",
  );
  return (
    <div id={id} className={cn("inline-flex items-center gap-1.5", className)} role="group" aria-label={L.guests}>
      <button type="button" onClick={dec} disabled={value <= min} aria-label="ลดจำนวนผู้เข้าพัก" className={btn}>
        <Minus className="size-4" aria-hidden />
      </button>
      <output className="min-w-[4.25rem] text-center font-heading font-semibold tabular-nums" aria-live="polite" data-testid="guest-count">
        <span key={value} className="rw-flash inline-block">
          {L.guestsN(value)}
        </span>
      </output>
      <button type="button" onClick={inc} disabled={value >= max} aria-label="เพิ่มจำนวนผู้เข้าพัก" className={btn}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
