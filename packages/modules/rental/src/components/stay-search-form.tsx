"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Moon, Search, Users, X } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { RangeCalendar } from "./range-calendar";
import { GuestStepper } from "./guest-stepper";
import { RentalStyles } from "./rental-styles";
import { L } from "../labels";
import { addDays, diffDays, formatThaiYmd, shiftMonth } from "../services/time";

export interface StaySearchFormProps {
  today: string;
  maxDate: string;
  maxGuests: number;
  initial?: { from?: string | null; to?: string | null; guests?: number | null };
  /** default: navigate to /stay?from&to&guests */
  onSearch?: (q: { from: string; to: string; guests: number }) => void;
  className?: string;
  /** narrow container (kept for callers of the old API): always the stacked layout */
  compact?: boolean;
  /** desktop calendar popover direction: "up" over the hero sea, "down" under a page header */
  panel?: "up" | "down";
  /** "bar" = one glass row on desktop; "stack" = stacked fields at every width (split hero column) */
  layout?: "bar" | "stack";
}

export function searchHref(q: { from: string; to: string; guests: number }): string {
  return `/stay?from=${q.from}&to=${q.to}&guests=${q.guests}`;
}

function useWide(query = "(min-width: 1024px)"): boolean {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return wide;
}

/**
 * Check-in / check-out / guests → search, as one glass bar (desktop) or a stacked card (phones). The calendar opens as a
 * popover (two months side by side ≥ 1024px, mounted after a media check so phones never hold hidden duplicate days)
 * above or below the bar, and inline under the fields on phones (no portal: works inside the hero and the /stay
 * header alike). It closes once both dates are chosen, on Escape and on an outside click.
 */
export function StaySearchForm({ today, maxDate, maxGuests, initial, onSearch, className, compact, panel = "down", layout = "bar" }: StaySearchFormProps) {
  const router = useRouter();
  const [from, setFrom] = React.useState<string | null>(initial?.from ?? null);
  const [to, setTo] = React.useState<string | null>(initial?.to ?? null);
  const [guests, setGuests] = React.useState(Math.min(Math.max(1, initial?.guests ?? 2), Math.max(1, maxGuests)));
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState((initial?.from ?? today).slice(0, 7));
  const [hover, setHover] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const panelId = React.useId();
  const formRef = React.useRef<HTMLFormElement>(null);
  const wide = useWide();
  const bar = layout === "bar" && !compact;
  const nights = from && to ? diffDays(from, to) : 0;
  const picking: "from" | "to" = from && !to ? "to" : "from";

  // outside click / Escape close the popover
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      formRef.current?.querySelector<HTMLButtonElement>(`[data-testid="${picking === "to" ? "stay-search-to" : "stay-search-from"}"]`)?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, picking]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from) {
      setError(L.pickCheckIn);
      setOpen(true);
      return;
    }
    if (!to) {
      setError(L.pickCheckOut);
      setOpen(true);
      return;
    }
    setError(null);
    const q = { from, to, guests };
    if (onSearch) onSearch(q);
    else {
      setPending(true);
      router.push(searchHref(q));
    }
  };

  const field = (label: string, value: string | null, placeholder: string, testId: string, active: boolean, extra?: React.ReactNode) => (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={open}
      aria-controls={panelId}
      data-active={active && open ? "" : undefined}
      onClick={() => {
        setOpen((o) => !o || !active);
        setError(null);
      }}
      className="rw-seg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <CalendarDays className="hidden size-5 shrink-0 text-primary-ink sm:block" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="rw-seg-label flex items-center gap-2">
          {label}
          {extra}
        </span>
        <span className="rw-seg-value" data-empty={value ? undefined : ""}>
          {value ? formatThaiYmd(value, { short: true, weekday: true }) : placeholder}
        </span>
      </span>
    </button>
  );

  const quick = (label: string, run: () => void) => (
    <button type="button" className="rw-press inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium transition hover:border-foreground" onClick={run}>
      {label}
    </button>
  );

  return (
    <form ref={formRef} onSubmit={submit} className={cn("relative grid gap-3", className)} data-testid="stay-search" noValidate>
      <RentalStyles />
      <div
        data-layout={bar ? "bar" : "stack"}
        className={cn("rw-stay-bar grid gap-1.5 rounded-[calc(var(--radius-2xl,1.5rem)+.25rem)] p-1.5", bar && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-center lg:gap-0 lg:rounded-full lg:p-2")}
      >
        <div className={cn("grid grid-cols-2 gap-1.5", bar && "lg:contents")}>
          {field(L.checkIn, from, L.pickCheckIn, "stay-search-from", picking === "from")}
          <div className={cn("min-w-0", bar && "rw-seg-sep")}>
            {field(
              L.checkOut,
              to,
              L.pickCheckOut,
              "stay-search-to",
              picking === "to",
              nights > 0 ? (
                <span className="rw-nights-pill">
                  <Moon className="size-3" aria-hidden /> {L.nights(nights)}
                </span>
              ) : null,
            )}
          </div>
        </div>
        <div className={cn("rw-seg cursor-default justify-between hover:bg-transparent", bar && "rw-seg-sep lg:justify-start")}>
          <span className="flex items-center gap-3">
            <Users className="size-5 shrink-0 text-primary-ink" aria-hidden />
            <span className="rw-seg-label whitespace-nowrap">{L.guests}</span>
          </span>
          <GuestStepper value={guests} onChange={setGuests} max={Math.max(1, maxGuests)} size="sm" />
        </div>
        <button
          type="submit"
          data-testid="stay-search-submit"
          className={cn(
            "rw-press inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[calc(var(--radius-xl,1rem)+.25rem)] bg-primary px-7 text-base font-semibold text-primary-foreground shadow-[0_14px_34px_-14px_var(--primary)] hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            bar && "lg:ml-1 lg:w-auto lg:rounded-full",
          )}
        >
          <Search className={cn("size-5", pending && "animate-pulse")} aria-hidden /> {L.search}
        </button>
      </div>

      {error && (
        <p role="alert" className="justify-self-start rounded-full bg-card px-4 py-2 text-sm font-medium text-destructive shadow-[0_10px_30px_-12px_rgba(0,0,0,.35)]">
          {error}
        </p>
      )}

      <div
        id={panelId}
        hidden={!open}
        data-dir={panel}
        role="group"
        aria-label="เลือกวันเข้าพัก"
        className={cn(
          "rw-cal-pop z-30 rounded-[var(--radius-2xl,1.5rem)] border border-border bg-card p-3 text-card-foreground sm:p-5",
          bar && (panel === "up" ? "lg:absolute lg:bottom-full lg:left-0 lg:mb-3" : "lg:absolute lg:top-full lg:left-0 lg:mt-1"),
          bar && "lg:w-[min(48rem,100%)]",
        )}
      >
        <div className={cn("grid gap-6", wide && bar && "grid-cols-2 gap-8")}>
          <RangeCalendar
            month={month}
            onMonthChange={setMonth}
            from={from}
            to={to}
            minDate={today}
            maxDate={maxDate}
            nav={wide && bar ? "prev" : "both"}
            hover={hover}
            onHoverChange={setHover}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
              setError(null);
              if (f && t) setOpen(false);
              else if (f && !t && !(wide && bar) && month !== f.slice(0, 7)) setMonth(f.slice(0, 7));
            }}
          />
          {wide && bar ? (
            <RangeCalendar
              month={shiftMonth(month, 1)}
              onMonthChange={(m) => setMonth(shiftMonth(m, -1))}
              from={from}
              to={to}
              minDate={today}
              maxDate={maxDate}
              nav="next"
              hover={hover}
              onHoverChange={setHover}
              onChange={(f, t) => {
                setFrom(f);
                setTo(t);
                setError(null);
                if (f && t) setOpen(false);
              }}
            />
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">{from && to ? `${formatThaiYmd(from, { short: true })} – ${formatThaiYmd(to, { short: true })} · ${L.nights(nights)}` : L.selectDatesHint}</p>
          <div className="flex flex-wrap gap-2">
            {quick("คืนนี้", () => {
              setFrom(today);
              setTo(addDays(today, 1));
              setOpen(false);
            })}
            {quick("สุดสัปดาห์นี้", () => {
              const fri = addDays(today, (5 - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7 || 7);
              setFrom(fri);
              setTo(addDays(fri, 2));
              setMonth(fri.slice(0, 7));
              setOpen(false);
            })}
            {(from || to) && (
              <button
                type="button"
                className="rw-press inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-primary-ink hover:underline"
                onClick={() => {
                  setFrom(null);
                  setTo(null);
                }}
              >
                <X className="size-3.5" aria-hidden /> ล้างวันที่
              </button>
            )}
            <button type="button" className="rw-press inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
              ปิด
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
