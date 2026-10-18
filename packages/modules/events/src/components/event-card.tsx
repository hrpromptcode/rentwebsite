import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Ticket } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { L, EVENT_STATUS, ORDER_STATUS, TICKET_STATUS, type Tone } from "../labels";
import { bkkParts, formatThaiDateRange, formatThaiSession, formatThaiTime, THAI_MONTHS_SHORT, THAI_WEEKDAYS_SHORT } from "../services/time";
import type { SaleState } from "../services/catalog";

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

/** Calendar-leaf date: weekday · big day · month (Bangkok). */
export function DateBadge({ date, size = "md", className, tone = "soft" }: { date: Date; size?: "sm" | "md" | "lg"; className?: string; tone?: "soft" | "dark" | "card" }) {
  const p = bkkParts(date);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-[var(--radius-lg)] leading-none",
        tone === "soft" && "bg-primary-soft text-primary",
        tone === "dark" && "border border-white/25 bg-black/45 text-white backdrop-blur",
        tone === "card" && "border border-border bg-card text-foreground shadow-sm",
        size === "sm" ? "w-12 py-1.5" : size === "lg" ? "w-20 py-3" : "w-16 py-2",
        className,
      )}
      aria-label={formatThaiDateRange(date, null)}
    >
      <span className={cn("font-medium opacity-80", size === "lg" ? "text-xs" : "text-[10px]")}>{THAI_WEEKDAYS_SHORT[p.weekday]}</span>
      <span className={cn("font-heading font-semibold tabular-nums", size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl")}>{p.d}</span>
      <span className={cn("font-medium opacity-80", size === "lg" ? "text-xs" : "text-[10px]")}>{THAI_MONTHS_SHORT[p.m - 1]}</span>
    </div>
  );
}

/** "เริ่มต้น ฿590" · "ฟรี" · "บัตรหมด". */
export function PriceFrom({ price, soldOut, className, size = "md" }: { price: number | null; soldOut?: boolean; className?: string; size?: "sm" | "md" | "lg" }) {
  if (soldOut) return <span className={cn("font-heading font-semibold text-destructive", size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl", className)}>{L.soldOut}</span>;
  if (price === null) return <span className={cn("text-sm text-muted-foreground", className)}>{L.notOnSale}</span>;
  return (
    <p className={cn("flex items-baseline gap-1.5", className)}>
      {price > 0 && <span className="text-xs text-muted-foreground">{L.from}</span>}
      <span className={cn("font-heading font-semibold tabular-nums text-primary", size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl")}>{price > 0 ? thb(price) : L.free}</span>
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

/**
 * Event card: cover with a date leaf, category, title, venue, from-price / sold-out, link to /events/[slug].
 * `variant="row"` is the horizontal list layout (/events list view, account), `"compact"` a small tile (past highlights).
 */
export function EventCard({ event, stats, variant = "card", className, priority, past }: { event: EventCardEvent; stats?: EventCardStats | null; variant?: "card" | "row" | "compact"; className?: string; priority?: boolean; past?: boolean }) {
  const href = `/events/${encodeURIComponent(event.slug)}`;
  const when = eventWhen(event, stats);
  const cancelled = event.status === "cancelled";
  const ended = past || event.status === "ended";
  const cover = event.cover ?? "";

  if (variant === "compact") {
    return (
      <Link href={href} className={cn("group relative block overflow-hidden rounded-[var(--radius-xl)] bg-muted", className)} aria-label={event.title}>
        <Img src={cover} alt={event.title} className="aspect-[4/5] size-full object-cover transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          {event.category && <p className="text-[11px] font-semibold tracking-[0.2em] text-white/75 uppercase">{event.category}</p>}
          <h3 className="font-heading mt-1 line-clamp-2 text-lg font-semibold leading-snug">{event.title}</h3>
          <p className="mt-1 text-xs text-white/80">{event.startsAt ? formatThaiDateRange(event.startsAt, event.endsAt) : ""}</p>
        </div>
      </Link>
    );
  }

  if (variant === "row") {
    return (
      <article className={cn("card group flex gap-4 overflow-hidden p-3 transition hover:-translate-y-0.5 hover:border-primary/50 md:gap-6 md:p-4", className)}>
        <Link href={href} className="relative block w-28 shrink-0 overflow-hidden rounded-[var(--radius-lg)] sm:w-44 md:w-56" aria-label={event.title}>
          <Img src={cover} alt={event.title} className="aspect-[4/3] size-full object-cover transition duration-700 group-hover:scale-105" priority={priority} />
          {when.date && <DateBadge date={when.date} size="sm" tone="dark" className="absolute top-2 left-2" />}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            {event.category && <span className="text-[11px] font-semibold tracking-[0.2em] text-primary-ink uppercase">{event.category}</span>}
            {event.featured && !ended && <Badge variant="soft">{L.featured}</Badge>}
            {cancelled ? <EventStatusBadge status="cancelled" /> : ended ? <Badge variant="muted">{L.ended}</Badge> : stats?.soldOut ? <Badge variant="destructive">{L.soldOut}</Badge> : null}
          </div>
          <h3 className="font-heading mt-1 text-lg font-semibold leading-snug md:text-xl">
            <Link href={href} className="hover:text-primary">
              {event.title}
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden /> {when.label}
            </span>
            {event.venueName && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-primary" aria-hidden /> {event.venueName}
              </span>
            )}
          </p>
          {event.summary && <p className="mt-2 hidden line-clamp-2 text-sm text-muted-foreground sm:block">{event.summary}</p>}
          <div className="mt-auto flex items-end justify-between gap-3 pt-3">
            {ended || cancelled ? <span /> : <PriceFrom price={stats?.fromPrice ?? null} soldOut={stats?.soldOut} size="sm" />}
            <Button asChild size="sm" variant={ended || cancelled ? "outline" : "default"} className="min-h-11">
              <Link href={href}>
                {ended || cancelled ? L.viewEvent : L.buyTickets} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("card group flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-1", className)} data-testid="event-card">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden" aria-label={event.title}>
        <Img src={cover} alt={event.title} className="size-full object-cover transition duration-700 group-hover:scale-105" priority={priority} />
        {when.date && <DateBadge date={when.date} tone="dark" className="absolute top-3 left-3" />}
        {event.featured && !ended && (
          <Badge className="absolute top-3 right-3" variant="default">
            {L.featured}
          </Badge>
        )}
        {(cancelled || ended || stats?.soldOut) && (
          <span className={cn("absolute right-3 bottom-3 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur", cancelled || stats?.soldOut ? "border-white/30 bg-destructive/90 text-destructive-foreground" : "border-white/30 bg-black/50 text-white")}>{cancelled ? EVENT_STATUS.cancelled!.label : ended ? L.ended : L.soldOut}</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {event.category && <p className="text-[11px] font-semibold tracking-[0.2em] text-primary-ink uppercase">{event.category}</p>}
        <h3 className="font-heading mt-1 text-xl font-semibold leading-snug">
          <Link href={href} className="hover:text-primary">
            {event.title}
          </Link>
        </h3>
        <p className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden /> {when.label}
          </span>
          {event.venueName && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0 text-primary" aria-hidden /> <span className="truncate">{event.venueName}</span>
            </span>
          )}
        </p>
        {event.summary && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{event.summary}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          {ended || cancelled ? <span className="text-sm text-muted-foreground">{cancelled ? EVENT_STATUS.cancelled!.label : L.ended}</span> : <PriceFrom price={stats?.fromPrice ?? null} soldOut={stats?.soldOut} size="sm" />}
          <Button asChild size="sm" variant={ended || cancelled ? "outline" : "default"} className="min-h-11">
            <Link href={href}>
              {ended || cancelled ? L.viewEvent : <Ticket className="size-4" />} {ended || cancelled ? null : L.buyTickets}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
