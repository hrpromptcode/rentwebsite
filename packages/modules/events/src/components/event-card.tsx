import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin, Ticket } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { L, EVENT_STATUS, ORDER_STATUS, TICKET_STATUS, type Tone } from "../labels";
import { bkkParts, formatThaiDateRange, formatThaiSession, formatThaiTime, THAI_MONTHS_SHORT, THAI_WEEKDAYS_SHORT } from "../services/time";
import type { SaleState } from "../services/catalog";
import { EvStyles } from "./ev-styles";
import { EvTilt } from "./ev-tilt";

/* Server-safe presentational pieces shared by sections and storefront pages (no hooks). */

export interface EventCardEvent {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  cover: string | null;
  category: string | null;
  venueName: string | null;
  status: string;
  featured: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface EventCardStats {
  fromPrice: number | null;
  soldOut: boolean;
  onSale: boolean;
  nextSession: { startsAt: Date; endsAt: Date } | null;
}

const toneVariant = (tone: Tone | undefined) => (tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "destructive" ? "destructive" : tone === "muted" ? "muted" : "soft");
const p2 = (n: number) => String(n).padStart(2, "0");

/** "21.11" (Bangkok day.month) — the poster date in the accent font. */
export function dotDate(date: Date): string {
  const p = bkkParts(date);
  return `${p2(p.d)}.${p2(p.m)}`;
}
/** "19:00" (Bangkok). */
export function hhmm(date: Date): string {
  const p = bkkParts(date);
  return `${p2(p.hh)}:${p2(p.mm)}`;
}
/** "ส. · 19:00" */
export function weekdayTime(date: Date): string {
  const p = bkkParts(date);
  return `${THAI_WEEKDAYS_SHORT[p.weekday]} · ${hhmm(date)}`;
}

/** Calendar-leaf date: weekday · big day (accent font) · month (Bangkok). */
export function DateBadge({ date, size = "md", className, tone = "soft" }: { date: Date; size?: "sm" | "md" | "lg"; className?: string; tone?: "soft" | "dark" | "card" }) {
  const p = bkkParts(date);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-[var(--radius-lg)] leading-none",
        tone === "soft" && "bg-primary-soft text-primary-ink",
        tone === "dark" && "border border-white/25 bg-black/45 text-white backdrop-blur",
        tone === "card" && "border border-border bg-card text-foreground shadow-sm",
        size === "sm" ? "w-12 py-1.5" : size === "lg" ? "w-20 py-3" : "w-16 py-2",
        className,
      )}
      aria-label={formatThaiDateRange(date, null)}
    >
      <EvStyles />
      <span className={cn("font-medium opacity-80", size === "lg" ? "text-xs" : "text-[10px]")}>{THAI_WEEKDAYS_SHORT[p.weekday]}</span>
      <span className={cn("ev-num font-bold", size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl")}>{p.d}</span>
      <span className={cn("font-medium opacity-80", size === "lg" ? "text-xs" : "text-[10px]")}>{THAI_MONTHS_SHORT[p.m - 1]}</span>
    </div>
  );
}

/** Poster date stamp: giant "21.11" in the accent font + "ส. · 19:00" (decorative; the full Thai date is in the text). */
export function DateStamp({ date, className, sub = true }: { date: Date; className?: string; sub?: boolean }) {
  return (
    <span aria-hidden className={cn("ev-stamp inline-block", className)}>
      <b>{dotDate(date)}</b>
      {sub && <span className="ev-mono mt-1.5 block opacity-80" data-script="thai">{weekdayTime(date)}</span>}
    </span>
  );
}

/** "เริ่มต้น ฿590" · "ฟรี" · "บัตรหมด". */
export function PriceFrom({ price, soldOut, className, size = "md", tone }: { price: number | null; soldOut?: boolean; className?: string; size?: "sm" | "md" | "lg"; tone?: "dark" }) {
  if (soldOut) return <span className={cn("font-heading font-semibold text-destructive", size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl", tone === "dark" && "text-[#ff8a8a]", className)}>{L.soldOut}</span>;
  if (price === null) return <span className={cn("text-sm", tone === "dark" ? "text-white/70" : "text-muted-foreground", className)}>{L.notOnSale}</span>;
  return (
    <p className={cn("flex items-baseline gap-1.5", className)}>
      {price > 0 && <span className={cn("text-xs", tone === "dark" ? "text-white/70" : "text-muted-foreground")}>{L.from}</span>}
      <span className={cn("ev-num font-bold", tone === "dark" ? "text-primary" : "ev-ink", size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl")}>{price > 0 ? thb(price) : L.free}</span>
    </p>
  );
}

export const SALE_STATE: Record<SaleState, { label: string; tone: Tone }> = {
  on_sale: { label: "เปิดจำหน่าย", tone: "success" },
  not_started: { label: L.salesNotStarted, tone: "muted" },
  closed: { label: L.salesClosed, tone: "muted" },
  sold_out: { label: L.soldOut, tone: "destructive" },
  hidden: { label: "", tone: "muted" },
};

export function SaleStateBadge({ state, className }: { state: SaleState; className?: string }) {
  const m = SALE_STATE[state];
  if (!m?.label) return null;
  return (
    <Badge variant={toneVariant(m.tone)} className={cn("rounded-full", className)}>
      {m.label}
    </Badge>
  );
}

export function EventStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = EVENT_STATUS[status];
  if (!m || status === "published") return null;
  return (
    <Badge variant={toneVariant(m.tone)} className={cn("rounded-full", className)}>
      {m.label}
    </Badge>
  );
}

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = ORDER_STATUS[status];
  return (
    <Badge variant={toneVariant(m?.tone)} className={cn("rounded-full", className)}>
      {m?.label ?? status}
    </Badge>
  );
}

export function TicketStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = TICKET_STATUS[status];
  return (
    <Badge variant={toneVariant(m?.tone)} className={cn("rounded-full", className)}>
      {m?.label ?? status}
    </Badge>
  );
}

/** Headline date for a card: the next session when there is one, else the event span. */
export function eventWhen(event: Pick<EventCardEvent, "startsAt" | "endsAt">, stats?: EventCardStats | null): { date: Date | null; label: string } {
  const s = stats?.nextSession;
  if (s) return { date: s.startsAt, label: formatThaiSession(s.startsAt, s.endsAt) };
  if (event.startsAt) return { date: event.startsAt, label: event.endsAt && event.endsAt.getTime() - event.startsAt.getTime() > 86_400_000 ? formatThaiDateRange(event.startsAt, event.endsAt) : `${formatThaiDateRange(event.startsAt, null)} ${formatThaiTime(event.startsAt)}` };
  return { date: null, label: "ประกาศวันเร็ว ๆ นี้" };
}

const scriptOf = (s: string) => (/[฀-๿]/.test(s) ? (/[A-Za-z]/.test(s) ? "mixed" : "thai") : "latin");

/**
 * Event card. `card` = stage poster (cover, giant accent-font date stamp, beam glow + tilt on hover, a perforated
 * ticket stub with the from-price and "ซื้อบัตร"); `row` = project-list row (index, date stamp, big title, venue, price,
 * hover preview via the section's HoverPreview); `compact` = past-highlight tile (monochrome → colour on hover).
 */
export function EventCard({ event, stats, variant = "card", className, priority, past, index }: { event: EventCardEvent; stats?: EventCardStats | null; variant?: "card" | "row" | "compact"; className?: string; priority?: boolean; past?: boolean; index?: number }) {
  const href = `/events/${encodeURIComponent(event.slug)}`;
  const when = eventWhen(event, stats);
  const cancelled = event.status === "cancelled";
  const ended = past || event.status === "ended";
  const cover = event.cover ?? "";
  const closed = ended || cancelled;

  if (variant === "compact") {
    return (
      <Link href={href} className={cn("group relative block overflow-hidden rounded-[calc(var(--radius)*1.25)] bg-muted", className)} aria-label={event.title} data-cursor="view" data-cursor-label={L.viewEvent}>
        <EvStyles />
        <Img src={cover} alt={event.title} className="aspect-[4/5] size-full object-cover grayscale-[.7] transition duration-700 group-hover:scale-105 group-hover:grayscale-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
        {event.startsAt && <DateStamp date={event.startsAt} sub={false} className="absolute top-4 left-4 text-white [&_b]:text-[clamp(1.75rem,1.3rem+1.2vw,2.5rem)]" />}
        <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-5">
          {event.category && <p className="ev-mono text-white/70" data-script={scriptOf(event.category)}>{event.category}</p>}
          <h3 className="font-heading mt-1 line-clamp-2 text-lg leading-snug font-semibold md:text-xl" data-script={scriptOf(event.title)}>
            {event.title}
          </h3>
          <p className="mt-1 text-xs text-white/75">{event.startsAt ? formatThaiDateRange(event.startsAt, event.endsAt) : ""}</p>
        </div>
      </Link>
    );
  }

  if (variant === "row") {
    return (
      <article className={cn("rw-row group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b ev-hair py-6 md:grid-cols-[3.5rem_9rem_minmax(0,1fr)_auto] md:gap-x-8 md:py-8", className)} data-preview-src={cover || undefined} data-preview-alt={event.title} data-cursor="view" data-cursor-label={closed ? L.viewEvent : L.buyTickets}>
        <EvStyles />
        <span className="ev-mono hidden text-muted-foreground md:block">{p2((index ?? 0) + 1)}</span>
        <div className="row-span-2 md:row-span-1">
          {when.date ? <DateStamp date={when.date} className="ev-ink" /> : <span className="ev-mono text-muted-foreground">TBA</span>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {event.category && <span className="ev-mono ev-ink" data-script={scriptOf(event.category)}>{event.category}</span>}
            {cancelled ? <EventStatusBadge status="cancelled" /> : ended ? <Badge variant="muted">{L.ended}</Badge> : stats?.soldOut ? <Badge variant="destructive">{L.soldOut}</Badge> : event.featured ? <Badge variant="soft">{L.featured}</Badge> : null}
          </div>
          <h3 className="rw-row-title font-heading mt-1.5 text-[clamp(1.35rem,1.05rem+1.2vw,2.25rem)] leading-[1.2] font-bold text-balance" data-script={scriptOf(event.title)}>
            <Link href={href} className="ev-link-stretch focus-visible:outline-none">
              {event.title}
            </Link>
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{when.label}</span>
            {event.venueName && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-primary" aria-hidden /> <span className="truncate">{event.venueName}</span>
              </span>
            )}
          </p>
        </div>
        <div className="col-start-2 flex items-center justify-between gap-4 md:col-start-auto md:flex-col md:items-end md:justify-center">
          {closed ? <span className="text-sm text-muted-foreground">{cancelled ? EVENT_STATUS.cancelled!.label : L.ended}</span> : <PriceFrom price={stats?.fromPrice ?? null} soldOut={stats?.soldOut} size="sm" />}
          <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-full border ev-hair transition duration-500 group-hover:rotate-45 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </article>
    );
  }

  return (
    <EvTilt as="article" max={5} className={cn("ev-poster-wrap", className)} data-testid="event-card">
      <EvStyles />
      <div className="ev-poster">
        <div className="ev-poster-media aspect-[4/5]" data-past={closed ? "" : undefined} data-cursor="view" data-cursor-label={closed ? L.viewEvent : L.buyTickets}>
          <Img src={cover} alt={event.title} priority={priority} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
          <div className="ev-poster-scrim" />
          <div className="ev-beam" />
          <Link href={href} aria-hidden tabIndex={-1} className="absolute inset-0 z-[1]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-3 p-4 md:p-5">
            {when.date ? <DateStamp date={when.date} className="text-white drop-shadow-[0_2px_18px_rgba(0,0,0,.45)]" /> : <span className="ev-mono text-white/80">TBA</span>}
            <div className="flex flex-col items-end gap-1.5">
              {event.featured && !closed && <span className="ev-mono rounded-full bg-primary px-2.5 py-1 text-primary-foreground" data-script="thai">{L.featured}</span>}
              {(cancelled || ended || stats?.soldOut) && (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", cancelled || stats?.soldOut ? "bg-destructive text-destructive-foreground" : "bg-black/60 text-white backdrop-blur")}>{cancelled ? EVENT_STATUS.cancelled!.label : ended ? L.ended : L.soldOut}</span>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] p-4 md:p-5">
            {event.category && <p className="ev-mono mb-2 inline-flex rounded-full border border-white/25 px-2.5 py-0.5 text-white/85" data-script={scriptOf(event.category)}>{event.category}</p>}
            <h3 className="ev-poster-title text-white" data-script={scriptOf(event.title)}>
              <Link href={href} className="pointer-events-auto rounded-sm">
                {event.title}
              </Link>
            </h3>
            <p className="mt-2 text-[13px] leading-snug text-white/75">{when.label}</p>
            {event.venueName && (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/75">
                <MapPin className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{event.venueName}</span>
              </p>
            )}
          </div>
        </div>
        <div className="ev-stub">
          {closed ? <span className="text-sm text-muted-foreground">{cancelled ? EVENT_STATUS.cancelled!.label : L.ended}</span> : <PriceFrom price={stats?.fromPrice ?? null} soldOut={stats?.soldOut} size="sm" />}
          <Link href={href} className={cn("relative z-[3] inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition duration-300", closed ? "border ev-hair hover:border-primary" : "bg-primary text-primary-foreground hover:shadow-[0_10px_30px_-10px_var(--primary)]")} tabIndex={-1} aria-hidden>
            {closed ? L.viewEvent : (
              <>
                <Ticket className="size-4" /> {L.buyTickets}
              </>
            )}
          </Link>
        </div>
      </div>
    </EvTilt>
  );
}
