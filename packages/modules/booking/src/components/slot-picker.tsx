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
  if (!visible.length) return <p className={cn("rounded-[calc(var(--radius,.75rem)*1.2)] border border-dashed p-8 text-center text-sm text-muted-foreground", className)}>{L.noSlots}</p>;
  const groups = PARTS.map((p) => ({ ...p, items: visible.filter((s) => dayPartOf(s.start) === p.key) })).filter((g) => g.items.length);
  let n = 0;
  return (
    <div className={cn("space-y-6", className)}>
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <g.Icon className="size-3.5 text-primary" /> {g.label}
            <span aria-hidden className="ml-2 h-px flex-1 bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)]" />
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {g.items.map((s) => {
              const active = selected === s.start;
              const i = n++;
              return (
                <button
                  key={s.start}
                  type="button"
                  disabled={!s.available}
                  aria-pressed={active}
                  onClick={() => onSelect(s.start)}
                  style={{ "--i": Math.min(i, 24) } as React.CSSProperties}
                  className={cn(
                    "bk-pop flex min-h-12 flex-col items-center justify-center rounded-full border px-2 py-1.5 text-sm font-medium tabular-nums transition-[background-color,border-color,box-shadow,transform] duration-300 active:scale-95",
                    active ? "scale-105 border-primary bg-primary text-primary-foreground shadow-[0_12px_26px_-12px_var(--primary)]" : "border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] bg-card hover:-translate-y-0.5 hover:border-primary hover:bg-primary-soft",
                    !s.available && "cursor-not-allowed border-dashed text-muted-foreground/50 line-through hover:translate-y-0 hover:border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] hover:bg-transparent",
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
