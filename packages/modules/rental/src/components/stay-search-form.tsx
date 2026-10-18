"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Search, Users, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { RangeCalendar } from "./range-calendar";
import { GuestStepper } from "./guest-stepper";
import { L } from "../labels";
import { addDays, diffDays, formatThaiYmd } from "../services/time";

export interface StaySearchFormProps {
  today: string;
  maxDate: string;
  maxGuests: number;
  initial?: { from?: string | null; to?: string | null; guests?: number | null };
  /** default: navigate to /stay?from&to&guests */
  onSearch?: (q: { from: string; to: string; guests: number }) => void;
  className?: string;
  compact?: boolean;
}

export function searchHref(q: { from: string; to: string; guests: number }): string {
  return `/stay?from=${q.from}&to=${q.to}&guests=${q.guests}`;
}

/**
 * Check-in / check-out / guests → search. The calendar opens inline under the fields (no portal: works inside the hero
 * card on a 390px phone and in the /stay page header alike) and closes once both dates are chosen.
 */
export function StaySearchForm({ today, maxDate, maxGuests, initial, onSearch, className, compact }: StaySearchFormProps) {
  const router = useRouter();
  const [from, setFrom] = React.useState<string | null>(initial?.from ?? null);
  const [to, setTo] = React.useState<string | null>(initial?.to ?? null);
  const [guests, setGuests] = React.useState(Math.min(Math.max(1, initial?.guests ?? 2), Math.max(1, maxGuests)));
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState((initial?.from ?? today).slice(0, 7));
  const [error, setError] = React.useState<string | null>(null);
  const panelId = React.useId();
  const nights = from && to ? diffDays(from, to) : 0;

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
    else router.push(searchHref(q));
  };

  const field = (label: string, value: string | null, placeholder: string, testId: string, active: boolean) => (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => {
        setOpen((o) => !o || !active);
        setError(null);
      }}
      className={cn("flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-lg)] border bg-background px-3.5 text-left transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30", active && open ? "border-primary ring-[3px] ring-primary/20" : "border-input")}
    >
      <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn("block truncate text-sm font-medium", !value && "text-muted-foreground")}>{value ? formatThaiYmd(value, { short: true, weekday: true }) : placeholder}</span>
      </span>
    </button>
  );

  return (
    <form onSubmit={submit} className={cn("grid gap-3", className)} data-testid="stay-search" noValidate>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]" : "md:grid-cols-2 lg:grid-cols-[1.1fr_1.1fr_auto_auto] lg:items-end")}>
        {field(L.checkIn, from, L.pickCheckIn, "stay-search-from", !from || !!to)}
        {field(L.checkOut, to, L.pickCheckOut, "stay-search-to", !!from && !to)}
        <div className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-input bg-background px-3.5 lg:justify-start">
          <span className="flex items-center gap-2">
            <Users className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{L.guests}</span>
          </span>
          <GuestStepper value={guests} onChange={setGuests} max={Math.max(1, maxGuests)} size="sm" />
        </div>
        <Button type="submit" size="lg" className="min-h-14 w-full lg:w-auto" data-testid="stay-search-submit">
          <Search className="size-5" /> {L.search}
        </Button>
      </div>
      {(from || to) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {from && to ? <span>{L.nights(nights)}</span> : <span>{L.pickCheckOut}</span>}
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline"
            onClick={() => {
              setFrom(null);
              setTo(null);
              setOpen(true);
            }}
          >
            <X className="size-3.5" aria-hidden /> ล้างวันที่
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div id={panelId} hidden={!open} className="rounded-[var(--radius-xl)] border border-border bg-card p-3 sm:p-4">
        <RangeCalendar
          month={month}
          onMonthChange={setMonth}
          from={from}
          to={to}
          minDate={today}
          maxDate={maxDate}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
            setError(null);
            if (f && t) setOpen(false);
            else if (f && !t && month !== f.slice(0, 7)) setMonth(f.slice(0, 7));
          }}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{L.selectDatesHint}</span>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 px-2 text-primary hover:underline" onClick={() => { setFrom(today); setTo(addDays(today, 1)); setOpen(false); }}>
              คืนนี้
            </button>
            <button type="button" className="min-h-11 px-2 text-primary hover:underline" onClick={() => { const fri = addDays(today, (5 - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7 || 7); setFrom(fri); setTo(addDays(fri, 2)); setMonth(fri.slice(0, 7)); setOpen(false); }}>
              สุดสัปดาห์นี้
            </button>
            <button type="button" className="min-h-11 px-2 text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
              ปิด
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
