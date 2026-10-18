"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

/** 1…max guests with 44px −/+ buttons; the value is announced ("2 ท่าน"). */
export function GuestStepper({ value, onChange, min = 1, max, id, className, size = "md" }: { value: number; onChange: (n: number) => void; min?: number; max: number; id?: string; className?: string; size?: "sm" | "md" }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btn = cn("flex shrink-0 items-center justify-center rounded-full border border-border bg-background transition hover:bg-muted disabled:opacity-40 disabled:hover:bg-background", size === "sm" ? "size-10" : "size-11");
  return (
    <div id={id} className={cn("inline-flex items-center gap-2", className)} role="group" aria-label={L.guests}>
      <button type="button" onClick={dec} disabled={value <= min} aria-label="ลดจำนวนผู้เข้าพัก" className={btn}>
        <Minus className="size-4" aria-hidden />
      </button>
      <output className="min-w-[4.5rem] text-center font-medium tabular-nums" aria-live="polite" data-testid="guest-count">
        {L.guestsN(value)}
      </output>
      <button type="button" onClick={inc} disabled={value >= max} aria-label="เพิ่มจำนวนผู้เข้าพัก" className={btn}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
