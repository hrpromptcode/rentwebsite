"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { addDays, daysInMonth, parseYmd, THAI_MONTHS, THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, weekdayOf, ymdToString } from "../services/time";

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

/** "เสาร์ 17 ตุลาคม 2569" for a "YYYY-MM-DD" date. */
export function thaiDayLabel(date: string): string {
  const p = parseYmd(date);
  if (!p) return date;
  return `${THAI_WEEKDAYS[weekdayOf(p)]} ${p.d} ${THAI_MONTHS[p.m - 1]} ${p.y + 543}`;
}

/**
 * Own month grid (no date-picker dependency): Thai month names, BE year, availability dots, 44px cells.
 * ARIA grid pattern (RESPONSIVE_B2-10): grid → row (one per week) → gridcell buttons with Thai labels
 * ("เสาร์ 17 ตุลาคม 2569, ว่าง"), weekday column headers, one Tab stop (roving tabindex) and arrow keys / Home / End /
 * PageUp / PageDown to move between days and months. Days that cannot be booked are aria-disabled (still focusable, not
 * selectable). `data-date` carries the ISO date for scripts (enabled days: `button[role=gridcell]:not([aria-disabled])`).
 */
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
  const todayStr = todayYmd ? ymdToString(todayYmd) : minDate;
  const titleId = React.useId();
  const gridRef = React.useRef<HTMLDivElement>(null);
  const known = days !== null;
  const isDisabled = (date: string) => date < minDate || date > maxDate || (known && !days?.[date]?.available);

  // Roving tabindex: exactly one day of the shown month is in the Tab order. Unbookable days stay focusable
  // (aria-disabled, APG date grid) so arrow keys move by a fixed day / week, a fully booked month can still be entered,
  // and a focused day that turns out to be full after the availability loads keeps focus.
  const inRange = (d: string) => d >= minDate && d <= maxDate;
  const monthDates = cells.filter((c): c is string => !!c);
  const [focusDate, setFocusDate] = React.useState<string | null>(null);
  const tabStop =
    [focusDate, selected].find((d) => !!d && d.startsWith(month) && inRange(d)) ??
    monthDates.find((d) => !isDisabled(d)) ??
    monthDates.find(inRange) ??
    null;
  // after a keyboard move into another month, focus the target day once that month has rendered
  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    const want = pendingFocus.current;
    if (!want || !want.startsWith(month)) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${want}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus();
    }
  });

  const moveTo = (from: string, step: number, kind: "day" | "month" | "edge") => {
    const p = parseYmd(from);
    if (!p) return;
    let target: string;
    if (kind === "edge") {
      // Home / End: first / last day of the week row
      target = ymdToString(addDays(p, step < 0 ? -weekdayOf(p) : 6 - weekdayOf(p)));
    } else if (kind === "month") {
      const nm = shiftMonth(from.slice(0, 7), step);
      const [ny, nmm] = nm.split("-").map(Number) as [number, number];
      target = `${nm}-${String(Math.min(p.d, daysInMonth(ny, nmm))).padStart(2, "0")}`;
    } else {
      target = ymdToString(addDays(p, step));
    }
    if (target < minDate) target = minDate;
    if (target > maxDate) target = maxDate;
    if (target === from) return;
    setFocusDate(target);
    pendingFocus.current = target;
    const tm = target.slice(0, 7);
    if (tm !== month) onMonthChange(tm);
    else gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus();
  };

  const KEYS: Record<string, [number, "day" | "month" | "edge"]> = {
    ArrowLeft: [-1, "day"],
    ArrowRight: [1, "day"],
    ArrowUp: [-7, "day"],
    ArrowDown: [7, "day"],
    Home: [-1, "edge"],
    End: [1, "edge"],
    PageUp: [-1, "month"],
    PageDown: [1, "month"],
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, date: string) => {
    const k = KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    moveTo(date, k[0], k[1]);
  };

  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

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
          <p id={titleId} className="font-heading text-lg font-semibold" aria-live="polite">
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
      {/* SBR-010: 2px gaps on phones keep each day cell ≥ 44px wide at 390 */}
      <div ref={gridRef} role="grid" aria-labelledby={titleId} className="grid gap-0.5 sm:gap-1">
        <div role="row" className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium text-muted-foreground sm:gap-1">
          {THAI_WEEKDAYS_SHORT.map((w, i) => (
            <div key={w} role="columnheader" className="py-1">
              <span aria-hidden>{w}</span>
              <span className="sr-only">{THAI_WEEKDAYS[i]}</span>
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className={cn("grid grid-cols-7 gap-0.5 sm:gap-1", wi === 0 && "mt-1")}>
            {week.map((date, i) => {
              if (!date) return <div key={`e-${i}`} role="gridcell" />;
              const info = days?.[date];
              const outOfRange = date < minDate || date > maxDate;
              const disabled = isDisabled(date);
              const isSelected = selected === date;
              const isToday = date === todayStr;
              const status = outOfRange ? "จองไม่ได้" : !known ? (loadingLabel ?? "กำลังโหลด") : info?.available ? "ว่าง" : "เต็ม";
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  data-date={date}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${thaiDayLabel(date)}, ${status}`}
                  aria-disabled={disabled || undefined}
                  tabIndex={date === tabStop ? 0 : -1}
                  onClick={() => {
                    setFocusDate(date);
                    if (!disabled) onSelect(date);
                  }}
                  onKeyDown={(e) => onKeyDown(e, date)}
                  onFocus={() => setFocusDate(date)}
                  className={cn(
                    "relative flex h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] text-sm transition sm:h-12",
                    disabled ? "cursor-not-allowed text-muted-foreground/40" : "hover:bg-primary-soft",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                    isToday && !isSelected && "font-semibold text-primary",
                    !known && !outOfRange && "animate-pulse",
                  )}
                >
                  <span className="tabular-nums" aria-hidden>
                    {Number(date.slice(-2))}
                  </span>
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
        ))}
      </div>
    </div>
  );
}

export { shiftMonth };
