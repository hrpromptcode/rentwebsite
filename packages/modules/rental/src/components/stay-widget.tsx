"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CalendarDays, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { RangeCalendar, type RangeDayInfo } from "./range-calendar";
import { GuestStepper } from "./guest-stepper";
import { ExtrasPicker, type ExtraOption, type ExtraSelection } from "./extras-picker";
import { QuoteBreakdown, type QuoteBreakdownData } from "./quote-breakdown";
import { L } from "../labels";
import { diffDays, formatThaiRange, shiftMonth } from "../services/time";

export interface StayWidgetProps {
  type: { id: string; slug: string; name: string; maxGuests: number; minNights: number; baseGuests: number; extraGuestPrice: number };
  extras: ExtraOption[];
  config: { depositPercent: number; freeCancelDays: number; checkInTime: string; checkOutTime: string; payOptions: Array<"deposit" | "full"> };
  today: string;
  maxDate: string;
  initial?: { from?: string | null; to?: string | null; guests?: number | null; extras?: ExtraSelection[] };
  className?: string;
}

type QuoteState = { status: "idle" } | { status: "loading" } | { status: "ok"; quote: QuoteBreakdownData; remaining: number } | { status: "error"; error: string; remaining: number | null };

export function extrasParam(sel: ExtraSelection[]): string {
  return sel
    .filter((s) => s.qty > 0)
    .map((s) => `${s.id}:${s.qty}`)
    .join(",");
}

/**
 * Room-page booking widget: availability + price calendar (range), guests, add-ons, live quote, "จองเลย" → /stay/book.
 * Calendar months come from /api/rental/calendar, quotes from /api/rental/quote (both no-store).
 */
export function StayWidget({ type, extras, config, today, maxDate, initial, className }: StayWidgetProps) {
  const router = useRouter();
  const [from, setFrom] = React.useState<string | null>(initial?.from ?? null);
  const [to, setTo] = React.useState<string | null>(initial?.to ?? null);
  const [guests, setGuests] = React.useState(Math.min(Math.max(1, initial?.guests ?? Math.min(2, type.maxGuests)), type.maxGuests));
  const [sel, setSel] = React.useState<ExtraSelection[]>(initial?.extras ?? []);
  const [month, setMonth] = React.useState((initial?.from ?? today).slice(0, 7));
  const [months, setMonths] = React.useState<Record<string, Record<string, RangeDayInfo>>>({});
  const [quote, setQuote] = React.useState<QuoteState>({ status: "idle" });
  const nights = from && to ? diffDays(from, to) : 0;

  // availability of the shown month (+ the next one, so paging feels instant)
  React.useEffect(() => {
    const ctrl = new AbortController();
    const load = async (mo: string) => {
      if (months[mo]) return;
      try {
        const r = await fetch(`/api/rental/calendar?type=${type.id}&month=${mo}`, { signal: ctrl.signal, cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { days: Array<{ date: string; remaining: number; price: number; blocked: boolean; bookable: boolean }> };
        const map: Record<string, RangeDayInfo> = {};
        for (const d of data.days) map[d.date] = { bookable: d.bookable, price: d.price, remaining: d.remaining, blocked: d.blocked };
        setMonths((s) => ({ ...s, [mo]: map }));
      } catch {
        /* aborted / offline: the calendar keeps its loading state */
      }
    };
    void load(month);
    void load(shiftMonth(month, 1));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, type.id]);

  // live quote
  React.useEffect(() => {
    if (!from || !to) {
      setQuote({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setQuote({ status: "loading" });
    const t = setTimeout(async () => {
      try {
        const ex = extrasParam(sel);
        const r = await fetch(`/api/rental/quote?type=${type.id}&from=${from}&to=${to}&guests=${guests}${ex ? `&extras=${encodeURIComponent(ex)}` : ""}`, { signal: ctrl.signal, cache: "no-store" });
        const data = (await r.json()) as { ok: true; quote: QuoteBreakdownData; remaining: number } | { ok: false; error: string; remaining: number | null };
        if (data.ok) setQuote({ status: "ok", quote: data.quote, remaining: data.remaining });
        else setQuote({ status: "error", error: L.errors[data.error] ?? L.errors.unknown!, remaining: data.remaining });
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setQuote({ status: "error", error: L.errors.unknown!, remaining: null });
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [from, to, guests, sel, type.id]);

  // the visible month's availability: all months merged so a range crossing a month boundary validates correctly
  const days = React.useMemo(() => {
    const merged: Record<string, RangeDayInfo> = {};
    for (const mo of Object.keys(months)) Object.assign(merged, months[mo]);
    return months[month] ? merged : null;
  }, [months, month]);

  const payOption = config.payOptions[0] ?? null;
  const dueNow = quote.status === "ok" ? (payOption === "full" ? quote.quote.total : payOption === "deposit" ? quote.quote.deposit : 0) : null;
  const canBook = quote.status === "ok" && quote.remaining > 0;
  const bookHref = from && to ? `/stay/book?type=${encodeURIComponent(type.slug)}&from=${from}&to=${to}&guests=${guests}${extrasParam(sel) ? `&extras=${encodeURIComponent(extrasParam(sel))}` : ""}` : "#";

  return (
    <div className={cn("card p-4 sm:p-6", className)} data-testid="stay-widget">
      <h2 className="font-heading flex items-center gap-2 text-xl font-semibold">
        <CalendarDays className="size-5 text-primary" aria-hidden /> เลือกวันเข้าพัก
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{type.minNights > 1 ? `${L.minNights(type.minNights)} · ` : ""}ราคาต่อคืนแสดงบนปฏิทิน · {L.checkInTime(config.checkInTime)} · {L.checkOutTime(config.checkOutTime)}</p>

      <RangeCalendar className="mt-4" month={month} onMonthChange={setMonth} from={from} to={to} minDate={today} maxDate={maxDate} days={days} showPrice minNights={type.minNights} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="คำอธิบายปฏิทิน">
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden /> {L.available}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full border border-muted-foreground/40" aria-hidden /> {L.soldOut}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="line-through">12</span> {L.blocked}
        </li>
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-muted/60 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{L.checkIn} – {L.checkOut}</p>
          <p className="truncate font-medium" data-testid="stay-widget-range">
            {from && to ? `${formatThaiRange(from, to)} · ${L.nights(nights)}` : from ? `${L.pickCheckOut}` : L.pickDates}
          </p>
        </div>
        <GuestStepper value={guests} onChange={setGuests} max={type.maxGuests} size="sm" />
      </div>

      {extras.length > 0 && (
        <details className="group mt-4 rounded-[var(--radius-lg)] border border-border" open={sel.length > 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden /> {L.extras}
              {sel.length > 0 && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">{sel.length}</span>}
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">เลือกเพิ่ม</span>
          </summary>
          <div className="px-3 pb-3">
            <ExtrasPicker extras={extras} value={sel} onChange={setSel} />
          </div>
        </details>
      )}

      <div className="mt-5" aria-live="polite">
        {quote.status === "idle" && <p className="rounded-[var(--radius-md)] bg-muted/60 p-3 text-sm text-muted-foreground">{L.pickDates}</p>}
        {quote.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> กำลังคำนวณราคา…
          </p>
        )}
        {quote.status === "error" && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {quote.error}
          </p>
        )}
        {quote.status === "ok" && (
          <>
            {quote.remaining <= 0 ? (
              <p role="alert" className="mb-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {L.unavailable}
              </p>
            ) : quote.remaining <= 2 ? (
              <p className="mb-3 text-sm font-medium text-primary">{L.lastUnits(quote.remaining)}</p>
            ) : null}
            <QuoteBreakdown quote={quote.quote} dueNow={dueNow} dueLabel={payOption === "deposit" ? L.payOptionDeposit(config.depositPercent) : payOption === "full" ? L.dueNow : L.payAtProperty} />
          </>
        )}
      </div>

      <Button type="button" size="xl" className="mt-5 w-full" disabled={!canBook} onClick={() => canBook && router.push(bookHref)} data-testid="stay-widget-book">
        {L.bookNow} <ArrowRight className="size-5" />
      </Button>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> {L.policy(config.freeCancelDays, config.depositPercent)} · ยังไม่เรียกเก็บเงินในขั้นตอนนี้
      </p>
    </div>
  );
}
