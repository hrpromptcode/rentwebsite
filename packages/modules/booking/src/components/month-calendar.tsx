"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { addDays, daysInMonth, parseYmd, THAI_MONTHS, THAI_WEEKDAYS_SHORT, weekdayOf, ymdToString } from "../services/time";

export interface DayInfo {
  available: boolean;
  count: number;
}

export interface MonthCalendarProps {
  /** "YYYY-MM" currently shown */
  month: string;
  onMonthChange: (month: string) => void;
  /** "YYYY-MM-DD" */
  selected: string | null;
  onSelect: (date: string) => void;
  /** first / last bookable date (inclusive) */
  minDate: string;
  maxDate: string;
  /** availability per date; null while loading */
  days: Record<string, DayInfo> | null;
  className?: string;
  loadingLabel?: string;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Own month grid (no date-picker dependency): Thai month names, BE year, availability dots, 44px cells. */
export function MonthCalendar({ month, onMonthChange, selected, onSelect, minDate, maxDate, days, className, loadingLabel }: MonthCalendarProps) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = { y, m, d: 1 };
  const total = daysInMonth(y, m);
  const lead = weekdayOf(first); // 0 = Sunday → grid starts on Sunday
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: total }, (_, i) => ymdToString(addDays(first, i)))];
  while (cells.length % 7) cells.push(null);

  const minYm = minDate.slice(0, 7);
  const maxYm = maxDate.slice(0, 7);
  const canPrev = month > minYm;
  const canNext = month < maxYm;
  const todayYmd = parseYmd(minDate);

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => canPrev && onMonthChange(shiftMonth(month, -1))}
          disabled={!canPrev}
          aria-label="เดือนก่อนหน้า"
          className="flex size-11 items-center justify-center rounded-full transition hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="text-center">
          <p className="font-heading text-lg font-semibold">
            {THAI_MONTHS[m - 1]} {y + 543}
          </p>
          {days === null && <p className="text-xs text-muted-foreground">{loadingLabel ?? "กำลังโหลด…"}</p>}
        </div>
        <button
          type="button"
          onClick={() => canNext && onMonthChange(shiftMonth(month, 1))}
          disabled={!canNext}
          aria-label="เดือนถัดไป"
          className="flex size-11 items-center justify-center rounded-full transition hover:bg-muted disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium text-muted-foreground sm:gap-1">
        {THAI_WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      {/* SBR-010: 2px gaps on phones keep each day cell ≥ 44px wide at 390 */}
      <div role="grid" aria-label="ปฏิทิน" className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} aria-hidden />;
          const info = days?.[date];
          const outOfRange = date < minDate || date > maxDate;
          const known = days !== null;
          const disabled = outOfRange || (known && !info?.available);
          const isSelected = selected === date;
          const isToday = todayYmd ? date === ymdToString(todayYmd) : false;
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={date}
              disabled={disabled}
              onClick={() => onSelect(date)}
              className={cn(
                "relative flex h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] text-sm transition sm:h-12",
                disabled ? "text-muted-foreground/40" : "hover:bg-primary-soft",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                isToday && !isSelected && "font-semibold text-primary",
                !known && !outOfRange && "animate-pulse",
              )}
            >
              <span className="tabular-nums">{Number(date.slice(-2))}</span>
              {!outOfRange && known && (
                <span
                  aria-hidden
                  className={cn("mt-0.5 size-1.5 rounded-full", info?.available ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent")}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { shiftMonth };
