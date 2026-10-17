"use client";

import * as React from "react";
import { Loader2, Sun, Sunrise, Sunset } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { dayPartOf, formatBkkTime } from "../services/time";
import { L } from "../labels";

export interface SlotChip {
  start: string;
  end: string;
  available: boolean;
  remaining: number;
  /** class sessions: the instructor (null for stepped slots of group services) */
  staffId?: string | null;
}

export interface SlotPickerProps {
  slots: SlotChip[] | null;
  selected: string | null;
  onSelect: (start: string) => void;
  /** show "เหลือ n ที่" on chips (capacity services) */
  showRemaining?: boolean;
  /** staff id → name, to label class sessions with their instructor */
  staffNames?: Record<string, string>;
  className?: string;
}

const PARTS = [
  { key: "morning", label: L.morning, Icon: Sunrise },
  { key: "afternoon", label: L.afternoon, Icon: Sun },
  { key: "evening", label: L.evening, Icon: Sunset },
] as const;

/** Time chips grouped เช้า / บ่าย / เย็น. Every chip is at least 44px tall. */
export function SlotPicker({ slots, selected, onSelect, showRemaining, staffNames, className }: SlotPickerProps) {
  if (slots === null) {
    return (
      <div className={cn("flex items-center gap-2 py-8 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 animate-spin" /> {L.loadingSlots}
      </div>
    );
  }
  const visible = slots;
  if (!visible.length) return <p className={cn("rounded-[var(--radius-lg)] bg-muted p-6 text-center text-sm text-muted-foreground", className)}>{L.noSlots}</p>;
  const groups = PARTS.map((p) => ({ ...p, items: visible.filter((s) => dayPartOf(s.start) === p.key) })).filter((g) => g.items.length);
  return (
    <div className={cn("space-y-5", className)}>
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <g.Icon className="size-3.5" /> {g.label}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {g.items.map((s) => {
              const active = selected === s.start;
              return (
                <button
                  key={s.start}
                  type="button"
                  disabled={!s.available}
                  aria-pressed={active}
                  onClick={() => onSelect(s.start)}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center rounded-[var(--radius-md)] border px-2 py-1.5 text-sm font-medium tabular-nums transition",
                    active ? "border-primary bg-primary text-primary-foreground shadow-md shadow-glow/40" : "border-border bg-card hover:border-primary hover:bg-primary-soft",
                    !s.available && "cursor-not-allowed border-dashed text-muted-foreground/50 line-through hover:border-border hover:bg-transparent",
                  )}
                >
                  {formatBkkTime(s.start)}
                  {staffNames && s.staffId && staffNames[s.staffId] && <span className={cn("max-w-full truncate text-[10px] font-normal", active ? "text-primary-foreground/85" : "text-foreground/80")}>{staffNames[s.staffId]}</span>}
                  {showRemaining && s.available && s.remaining > 0 && <span className={cn("text-[10px] font-normal", active ? "text-primary-foreground/80" : "text-muted-foreground")}>เหลือ {s.remaining} ที่</span>}
                  {showRemaining && !s.available && s.remaining === 0 && <span className="text-[10px] font-normal no-underline">{L.full}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
