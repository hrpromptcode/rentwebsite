"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@rentweb/core/money";
import { RangeCalendar, type RangeDayInfo } from "./range-calendar";
import { GuestStepper } from "./guest-stepper";
import { ExtrasPicker, type ExtraOption, type ExtraSelection } from "./extras-picker";
import { QuoteBreakdown, type QuoteBreakdownData } from "./quote-breakdown";
import { RentalStyles } from "./rental-styles";
import { L } from "../labels";
import { diffDays, formatThaiRange, shiftMonth } from "../services/time";

export interface StayWidgetProps {
  type: { id: string; slug: string; name: string; maxGuests: number; minNights: number; baseGuests: number; extraGuestPrice: number };
  extras: ExtraOption[];
  config: { depositPercent: number; freeCancelDays: number; checkInTime: string; checkOutTime: string; payOptions: Array<"deposit" | "full"> };
  today: string;
  maxDate: string;
  initial?: { from?: string | null; to?: string | null; guests?: number | null; extras?: ExtraSelection[] };
  /** lowest nightly rate (satang) for the widget header */
  fromPrice?: number;
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
 * Room-page quote box: availability + price calendar (range), guests, add-ons, live quote, "จองเลย" → /stay/book.
 * Calendar months come from /api/rental/calendar, quotes from /api/rental/quote (both no-store).
 */
export function StayWidget({ type, extras, config, today, maxDate, initial, fromPrice, className }: StayWidgetProps) {
  const router = useRouter();
  const [from, setFrom] = React.useState<string | null>(initial?.from ?? null);
  const [to, setTo] = React.useState<string | null>(initial?.to ?? null);
  const [guests, setGuests] = React.useState(Math.min(Math.max(1, initial?.guests ?? Math.min(2, type.maxGuests)), type.maxGuests));
  const [sel, setSel] = React.useState<ExtraSelection[]>(initial?.extras ?? []);
  const [month, setMonth] = React.useState((initial?.from ?? today).slice(0, 7));
  const [months, setMonths] = React.useState<Record<string, Record<string, RangeDayInfo>>>({});
  const [quote, setQuote] = React.useState<QuoteState>({ status: "idle" });
  const [going, setGoing] = React.useState(false);
  const nights = from && to ? diffDays(from, to) : 0;

  // availability of the shown month (+ the next one, so paging feels instant); one in-flight request per month,
  // shared across re-runs of the effect (React's dev double-effect must not abort and re-issue the fetch)
  const inflight = React.useRef(new Map<string, Promise<Record<string, RangeDayInfo> | null>>());
  React.useEffect(() => {
    let alive = true;
    const load = (mo: string) => {
      if (months[mo]) return;
      const key = `${type.id}:${mo}`;
      let p = inflight.current.get(key);
      if (!p) {
        p = fetch(`/api/rental/calendar?type=${type.id}&month=${mo}`, { cache: "no-store" })
          .then(async (r) => {
            if (!r.ok) return null;
            const data = (await r.json()) as { days: Array<{ date: string; remaining: number; price: number; blocked: boolean; bookable: boolean }> };
            const map: Record<string, RangeDayInfo> = {};
            for (const d of data.days) map[d.date] = { bookable: d.bookable, price: d.price, remaining: d.remaining, blocked: d.blocked };
            return map;
          })
          .catch(() => null)
          .finally(() => inflight.current.delete(key));
        inflight.current.set(key, p);
      }
      void p.then((map) => {
        if (alive && map) setMonths((s) => (s[mo] ? s : { ...s, [mo]: map }));
      });
    };
    load(month);
    load(shiftMonth(month, 1));
    return () => {
      alive = false;
    };
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
    <div className={cn("overflow-hidden rounded-[var(--radius-2xl,1.5rem)] border border-border bg-card text-card-foreground shadow-float", className)} data-testid="stay-widget">
      <RentalStyles />
      <div className="flex items-end justify-between gap-4 border-b border-border bg-surface px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="font-heading text-step-2 leading-tight font-semibold">เลือกวันเข้าพัก</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {type.minNights > 1 ? `${L.minNights(type.minNights)} · ` : ""}ราคาต่อคืนแสดงบนปฏิทิน
          </p>
        </div>
        {fromPrice ? (
          <p className="shrink-0 text-right leading-tight">
            <span className="block text-[0.7rem] text-muted-foreground">{L.from}</span>
            <span className="rw-price-num text-step-2 text-primary-ink">{thb(fromPrice)}</span>
            <span className="text-xs text-muted-foreground"> {L.perNight}</span>
          </p>
        ) : null}
      </div>

      <div className="p-4 sm:p-6">
        <RangeCalendar
          month={month}
          onMonthChange={setMonth}
          from={from}
          to={to}
          minDate={today}
          maxDate={maxDate}
          days={days}
          showPrice
          minNights={type.minNights}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
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
        <p className="mt-1 text-xs text-muted-foreground">
          {L.checkInTime(config.checkInTime)} · {L.checkOutTime(config.checkOutTime)}
        </p>

        <div className="mt-5 grid gap-3 rounded-[var(--radius-xl,1rem)] border border-border p-3.5 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {L.checkIn} – {L.checkOut}
            </p>
            <p className="truncate font-heading font-semibold" data-testid="stay-widget-range">
              {from && to ? `${formatThaiRange(from, to)} · ${L.nights(nights)}` : from ? `${L.pickCheckOut}` : L.pickDates}
            </p>
          </div>
          <GuestStepper value={guests} onChange={setGuests} max={type.maxGuests} size="sm" />
        </div>

        {extras.length > 0 && (
          <details className="group mt-3 rounded-[var(--radius-xl,1rem)] border border-border" open={sel.length > 0}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="size-4 text-primary-ink" aria-hidden /> {L.extras}
                {sel.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{sel.length}</span>}
              </span>
              <Plus className="size-4 text-muted-foreground transition-transform duration-300 group-open:rotate-45" aria-hidden />
            </summary>
            <div className="px-3 pb-3">
              <ExtrasPicker extras={extras} value={sel} onChange={setSel} />
            </div>
          </details>
        )}

        <div className="mt-5 min-h-[3.25rem]" aria-live="polite">
          {quote.status === "idle" && <p className="rounded-[var(--radius-md)] bg-muted/70 p-3 text-sm text-muted-foreground">{L.pickDates}</p>}
          {quote.status === "loading" && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> กำลังคำนวณราคา…
              </p>
              <span className="rw-loading-block block h-9 rounded-[var(--radius-md)]" aria-hidden />
            </div>
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
                <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-ink">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden /> {L.lastUnits(quote.remaining)}
                </p>
              ) : null}
              <QuoteBreakdown quote={quote.quote} dueNow={dueNow} dueLabel={payOption === "deposit" ? L.payOptionDeposit(config.depositPercent) : payOption === "full" ? L.dueNow : L.payAtProperty} />
            </>
          )}
        </div>

        <button
          type="button"
          disabled={!canBook || going}
          onClick={() => {
            if (!canBook) return;
            setGoing(true);
            router.push(bookHref);
          }}
          data-testid="stay-widget-book"
          className="rw-press group/book mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-[0_16px_36px_-16px_var(--primary)] hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
        >
          {going ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          {L.bookNow}
          {!going && <ArrowRight className="size-5 transition-transform duration-300 group-hover/book:translate-x-1" aria-hidden />}
        </button>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary-ink" aria-hidden /> {L.policy(config.freeCancelDays, config.depositPercent)} · ยังไม่เรียกเก็บเงินในขั้นตอนนี้
        </p>
      </div>
    </div>
  );
}
