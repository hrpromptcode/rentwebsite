"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { RentalStyles } from "./rental-styles";
import { addDays, daysInMonth, diffDays, eachNight, parseYmd, shiftMonth, THAI_MONTHS, THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, weekdayOf, ymdToString } from "../services/time";

export interface RangeDayInfo {
  /** a night starting on this date can be sold */
  bookable: boolean;
  /** satang per night */
  price?: number;
  remaining?: number;
  blocked?: boolean;
}

export interface RangeCalendarProps {
  /** "YYYY-MM" currently shown */
  month: string;
  onMonthChange: (month: string) => void;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  /** first / last selectable check-in date (inclusive) */
  minDate: string;
  maxDate: string;
  /** per-date availability: undefined = no information (every date selectable), null = loading */
  days?: Record<string, RangeDayInfo> | null;
  showPrice?: boolean;
  minNights?: number;
  className?: string;
  loadingLabel?: string;
  /** which month arrows to render (a two-month view shows "prev" on the left grid and "next" on the right one) */
  nav?: "both" | "prev" | "next";
  /** shared hover day (two-month view: the range preview spans both grids) */
  hover?: string | null;
  onHoverChange?: (date: string | null) => void;
}

/** "เสาร์ 17 ตุลาคม 2569" */
export function thaiDayLabel(date: string): string {
  const p = parseYmd(date);
  if (!p) return date;
  return `${THAI_WEEKDAYS[weekdayOf(date)]} ${p.d} ${THAI_MONTHS[p.m - 1]} ${p.y + 543}`;
}

function baht(satang: number): string {
  return `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
}

/**
 * Date-range month grid (check-in → check-out, check-out exclusive): Thai month names, BE year, 44px+ cells, price per
 * night, range highlight with hover preview, ARIA grid with roving tabindex and arrow-key navigation. Unsellable nights
 * are aria-disabled; a check-out may land on a closed day as long as every night before it is open.
 */
export function RangeCalendar({ month, onMonthChange, from, to, onChange, minDate, maxDate, days, showPrice, minNights = 1, className, loadingLabel, nav = "both", hover: hoverProp, onHoverChange }: RangeCalendarProps) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = daysInMonth(y, m);
  const first = `${month}-01`;
  const lead = weekdayOf(first);
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: total }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const checkoutMax = addDays(maxDate, 1);
  const minYm = minDate.slice(0, 7);
  const maxYm = checkoutMax.slice(0, 7);
  const canPrev = month > minYm;
  const canNext = month < maxYm;
  const loading = days === null;
  const picking: "from" | "to" = from && !to ? "to" : "from";
  const [ownHover, setOwnHover] = React.useState<string | null>(null);
  const hover = hoverProp !== undefined ? hoverProp : ownHover;
  const setHover = (d: string | null) => (onHoverChange ? onHoverChange(d) : setOwnHover(d));
  const [focusDate, setFocusDate] = React.useState<string | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  const nightOpen = (d: string) => d >= minDate && d <= maxDate && (days === undefined || days === null ? true : !!days[d]?.bookable);
  const nightsOpen = (a: string, b: string) => eachNight(a, b).every(nightOpen);
  const validCheckout = (d: string) => !!from && d > from && d <= checkoutMax && diffDays(from, d) >= Math.max(1, minNights) && nightsOpen(from, d);
  const canStart = (d: string) => nightOpen(d);
  const isDisabled = (d: string) => (picking === "to" ? !validCheckout(d) && !canStart(d) : !canStart(d));

  const pick = (d: string) => {
    if (picking === "to" && validCheckout(d)) {
      onChange(from, d);
      setHover(null);
      return;
    }
    if (canStart(d)) onChange(d, null);
  };

  // range preview while choosing the check-out
  const previewTo = picking === "to" && hover && hover > (from ?? "") && validCheckout(hover) ? hover : to;
  const inRange = (d: string) => !!from && !!previewTo && d > from && d < previewTo;

  // roving tabindex: one Tab stop per month (focused day, else selected check-in, else the first selectable day)
  const monthDates = cells.filter((c): c is string => !!c);
  const inWindow = (d: string) => d >= minDate && d <= checkoutMax;
  const tabStop = [focusDate, from].find((d) => !!d && d.startsWith(month) && inWindow(d)) ?? monthDates.find((d) => !isDisabled(d)) ?? monthDates.find(inWindow) ?? null;
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
  const moveTo = (fromDate: string, step: number, kind: "day" | "month" | "edge") => {
    let target: string;
    if (kind === "edge") target = addDays(fromDate, step < 0 ? -weekdayOf(fromDate) : 6 - weekdayOf(fromDate));
    else if (kind === "month") {
      const nm = shiftMonth(fromDate.slice(0, 7), step);
      const [ny, nmm] = nm.split("-").map(Number) as [number, number];
      target = `${nm}-${String(Math.min(Number(fromDate.slice(-2)), daysInMonth(ny, nmm))).padStart(2, "0")}`;
    } else target = addDays(fromDate, step);
    if (target < minDate) target = minDate;
    if (target > checkoutMax) target = checkoutMax;
    if (target === fromDate) return;
    setFocusDate(target);
    pendingFocus.current = target;
    const tm = target.slice(0, 7);
    if (tm !== month) onMonthChange(tm);
    else gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus();
  };
  const KEYS: Record<string, [number, "day" | "month" | "edge"]> = { ArrowLeft: [-1, "day"], ArrowRight: [1, "day"], ArrowUp: [-7, "day"], ArrowDown: [7, "day"], Home: [-1, "edge"], End: [1, "edge"], PageUp: [-1, "month"], PageDown: [1, "month"] };

  return (
    <div className={cn("rw-cal select-none", className)} data-picking={picking}>
      <RentalStyles />
      <div className="mb-3 flex items-center justify-between gap-2">
        {nav !== "next" ? (
          <button type="button" onClick={() => canPrev && onMonthChange(shiftMonth(month, -1))} disabled={!canPrev} aria-label="เดือนก่อนหน้า" className="rw-cal-nav">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        ) : (
          <span aria-hidden className="size-11 shrink-0" />
        )}
        <div className="min-w-0 text-center">
          <p id={titleId} className="font-heading text-lg font-semibold leading-tight" aria-live="polite">
            {THAI_MONTHS[m - 1]} <span className="font-accent tabular-nums">{y + 543}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{loading ? (loadingLabel ?? "กำลังโหลดห้องว่าง…") : picking === "to" ? "เลือกวันเช็กเอาต์" : "เลือกวันเช็กอิน"}</p>
        </div>
        {nav !== "prev" ? (
          <button type="button" onClick={() => canNext && onMonthChange(shiftMonth(month, 1))} disabled={!canNext} aria-label="เดือนถัดไป" className="rw-cal-nav">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        ) : (
          <span aria-hidden className="size-11 shrink-0" />
        )}
      </div>
      <div ref={gridRef} role="grid" aria-labelledby={titleId} className="grid gap-y-1" onMouseLeave={() => setHover(null)}>
        <div role="row" className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
          {THAI_WEEKDAYS_SHORT.map((w, i) => (
            <div key={w} role="columnheader" className="py-1">
              <span aria-hidden>{w}</span>
              <span className="sr-only">{THAI_WEEKDAYS[i]}</span>
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className={cn("grid grid-cols-7", wi === 0 && "mt-1")}>
            {week.map((date, i) => {
              if (!date) return <div key={`e-${i}`} role="gridcell" />;
              const info = days?.[date];
              const out = !inWindow(date);
              const disabled = out || isDisabled(date);
              const isFrom = from === date;
              const isTo = (previewTo ?? to) === date && !!from;
              const between = inRange(date);
              const isToday = date === minDate;
              const status = out ? "จองไม่ได้" : loading ? "กำลังโหลด" : picking === "to" && validCheckout(date) ? "เช็กเอาต์ได้" : info?.blocked ? "ปิดจอง" : nightOpen(date) ? (info?.remaining !== undefined ? `ว่าง ${info.remaining} ห้อง` : "ว่าง") : "เต็ม";
              const price = showPrice && info?.price && nightOpen(date) && !out ? baht(info.price) : null;
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  data-date={date}
                  aria-selected={isFrom || (to === date && !!from) || between || undefined}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${thaiDayLabel(date)}, ${status}${price ? `, ${price} ต่อคืน` : ""}`}
                  aria-disabled={disabled || undefined}
                  tabIndex={date === tabStop ? 0 : -1}
                  onClick={() => {
                    setFocusDate(date);
                    if (!disabled) pick(date);
                  }}
                  onMouseEnter={() => setHover(date)}
                  onFocus={() => {
                    setFocusDate(date);
                    setHover(date);
                  }}
                  onKeyDown={(e) => {
                    const k = KEYS[e.key];
                    if (!k) return;
                    e.preventDefault();
                    moveTo(date, k[0], k[1]);
                  }}
                  data-edge={isFrom ? "from" : isTo ? "to" : undefined}
                  data-span={(isFrom && !!previewTo && previewTo !== from) || (isTo && !isFrom) ? "" : undefined}
                  data-mid={between ? "" : undefined}
                  data-blocked={info?.blocked ? "" : undefined}
                  className={cn(
                    "rw-day relative isolate flex w-full flex-col items-center justify-center text-sm",
                    showPrice ? "h-12 sm:h-14" : "h-11 sm:h-12",
                    disabled ? "cursor-not-allowed text-muted-foreground/40" : "cursor-pointer",
                    (isFrom || isTo) && "text-primary-foreground",
                    isToday && !isFrom && !isTo && "font-semibold text-primary-ink",
                    loading && !out && "animate-pulse",
                    info?.blocked && !disabled && "line-through",
                  )}
                >
                  <span aria-hidden className="rw-day-fill" />
                  <span className="tabular-nums leading-none" aria-hidden>
                    {Number(date.slice(-2))}
                  </span>
                  {price ? (
                    <span className={cn("rw-day-price mt-1 font-accent text-[10px] leading-none tabular-nums", isFrom || isTo ? "text-primary-foreground/85" : "text-muted-foreground")} aria-hidden>
                      {price}
                    </span>
                  ) : !out && days && !loading ? (
                    <span aria-hidden className={cn("mt-1 size-1.5 rounded-full", nightOpen(date) ? (isFrom || isTo ? "bg-primary-foreground" : "bg-primary") : "bg-transparent")} />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
