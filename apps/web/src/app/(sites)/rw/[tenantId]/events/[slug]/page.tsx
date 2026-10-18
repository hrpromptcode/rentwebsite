import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, ChevronLeft, Clock, DoorOpen, ExternalLink, MapPin, Megaphone, MessageCircle, Phone, Ticket, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img, Prose } from "@rentweb/storefront";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { serializeJsonLd } from "@rentweb/core";
import { thb } from "@rentweb/core/money";
import { eventsConfig, getPublicEvent, sanitizeHtml, ticketPaymentMethods } from "@rentweb/module-events/services";
import { DateBadge, EventStatusBadge, L, METHOD_LABELS, PriceFrom, SaleStateBadge, formatThaiDateRange, formatThaiDateTime, formatThaiSession, formatThaiTime } from "@rentweb/module-events/ui";
import { Countdown, TicketPicker, type PickerSession } from "@rentweb/module-events/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;
type Search = Promise<{ session?: string }>;

const htmlClass =
  "leading-relaxed text-foreground/90 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_h2]:font-heading [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:font-heading [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_hr]:my-6";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) return {};
  const detail = await tenantTx(tenantId, (tx) => getPublicEvent(tx, tenantId, decodeSlug(slug)));
  if (!detail) return {};
  const e = detail.event;
  return { title: e.title, description: e.summary ?? undefined, openGraph: e.cover ? { images: [{ url: e.cover }] } : undefined };
}

const finite = (n: number) => (Number.isFinite(n) ? n : null);

/** /events/[slug]?session=<id> – cover, when / where (map), sessions, ticket types with sale state, and the buy widget. */
export default async function EventPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, slug } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) notFound();
  const [detail, customer] = await Promise.all([tenantTx(tenantId, (tx) => getPublicEvent(tx, tenantId, decodeSlug(slug))), getCurrentCustomer(tenantId)]);
  if (!detail) notFound();
  const { event, sessions, ticketTypes, fromPrice, soldOut, onSale } = detail;
  const config = eventsConfig(runtime.config.moduleConfig);
  const settings = runtime.config.settings;
  const contact = (settings.contact as { phone?: string; lineId?: string; lineUrl?: string; email?: string } | undefined) ?? {};
  const methods: PaymentMethodOption[] = ticketPaymentMethods(settings).map((m) => ({ value: m, label: METHOD_LABELS[m]!.label, description: METHOD_LABELS[m]!.description }));

  const openSessions = sessions.filter((s) => s.open);
  const next = openSessions[0] ?? null;
  const start = next?.startsAt ?? event.startsAt;
  const end = next?.endsAt ?? event.endsAt;
  const live = event.status === "published";
  const isHtml = /<[a-z][\s\S]*>/i.test(event.description ?? "");
  const mapEmbed = event.venueMapUrl && /output=embed|\/maps\/embed/.test(event.venueMapUrl) ? event.venueMapUrl : null;
  const mapLink = event.venueMapUrl ? event.venueMapUrl.replace(/[?&]output=embed/, "") : event.venueAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueAddress)}` : null;
  const pickerSessions: PickerSession[] = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    doorsOpen: s.doorsOpen?.toISOString() ?? null,
    remaining: finite(s.remaining),
    open: s.open,
    soldOut: s.soldOut,
    ticketTypes: s.ticketTypes.map((t) => ({ id: t.id, sessionId: t.sessionId, name: t.name, description: t.description, price: t.price, remaining: finite(t.remaining), saleState: t.saleState, minPerOrder: t.minPerOrder, maxPerOrder: t.maxPerOrder, salesStart: t.salesStart?.toISOString() ?? null, salesEnd: t.salesEnd?.toISOString() ?? null })),
  }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.summary ?? undefined,
    image: event.cover ?? undefined,
    startDate: start?.toISOString(),
    endDate: end?.toISOString(),
    eventStatus: event.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: event.venueName ? { "@type": "Place", name: event.venueName, address: event.venueAddress ?? undefined } : undefined,
    organizer: event.organizer ? { "@type": "Organization", name: event.organizer } : { "@type": "Organization", name: runtime.config.name },
    offers: ticketTypes
      .filter((t) => t.saleState === "on_sale")
      .map((t) => ({ "@type": "Offer", name: t.name, price: (t.price / 100).toFixed(2), priceCurrency: "THB", availability: "https://schema.org/InStock", validFrom: t.salesStart?.toISOString() })),
  };

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className={cn("container-x pt-6 md:pt-10 md:pb-24", onSale ? "pb-28" : "pb-16")}>
        <Link href="/events" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft className="size-4" /> {L.allEvents}
        </Link>

        {/* cover */}
        <Reveal className="relative mt-4 overflow-hidden rounded-[var(--radius-2xl)] bg-muted">
          <Img src={event.cover ?? ""} alt={event.title} className="aspect-[16/9] w-full object-cover md:aspect-[21/9]" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3 md:inset-x-6 md:bottom-6">
            <div className="flex items-center gap-3">
              {start && <DateBadge date={start} size="lg" tone="dark" />}
              {event.category && <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-white uppercase backdrop-blur">{event.category}</span>}
            </div>
            <div className="flex gap-2">
              <EventStatusBadge status={event.status} className="px-3 py-1 text-sm" />
              {live && soldOut && (
                <Badge variant="destructive" className="px-3 py-1 text-sm">
                  {L.soldOut}
                </Badge>
              )}
            </div>
          </div>
        </Reveal>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
          <div className="min-w-0">
            <Reveal>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{[event.organizer ?? runtime.config.name, event.category].filter(Boolean).join(" · ")}</p>
              <h1 className="heading-display mt-2 text-4xl font-semibold md:text-5xl" data-testid="event-title">
                {event.title}
              </h1>
              {event.summary && <p className="mt-4 text-lg text-muted-foreground">{event.summary}</p>}
              <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {start && (
                  <li className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-4 text-primary" aria-hidden /> {openSessions.length > 1 ? `${formatThaiDateRange(openSessions[0]!.startsAt, openSessions[openSessions.length - 1]!.endsAt)} · ${L.sessionsN(openSessions.length)}` : formatThaiSession(start, end)}
                  </li>
                )}
                {event.venueName && (
                  <li className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 text-primary" aria-hidden /> {event.venueName}
                  </li>
                )}
              </ul>
              {live && <PriceFrom price={fromPrice} soldOut={soldOut} size="lg" className="mt-5" />}
              {live && start && (
                <div className="mt-4">
                  <Countdown to={start.toISOString()} endsAt={end?.toISOString()} variant="inline" />
                </div>
              )}
            </Reveal>

            {event.status === "cancelled" && (
              <Reveal className="mt-6 flex items-start gap-3 rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="status">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden /> {L.eventCancelled}
              </Reveal>
            )}
            {event.status === "ended" && (
              <Reveal className="mt-6 flex items-start gap-3 rounded-[var(--radius-lg)] bg-muted p-4 text-sm text-muted-foreground" role="status">
                <Clock className="mt-0.5 size-5 shrink-0" aria-hidden /> {L.eventEnded}
              </Reveal>
            )}

            {event.description && (
              <Reveal delay={0.05} className="mt-10">
                <h2 className="font-heading text-2xl font-semibold">{L.aboutEvent}</h2>
                {isHtml ? <div className={`mt-4 ${htmlClass}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.description) }} /> : <Prose text={event.description} className="mt-4 text-foreground/90" />}
              </Reveal>
            )}

            {sessions.length > 0 && (
              <Reveal delay={0.05} className="mt-10">
                <h2 className="font-heading text-2xl font-semibold">{L.sessions}</h2>
                <Stagger className="mt-4 grid gap-3" stagger={0.04} data-testid="session-list">
                  {sessions.map((s) => (
                    <StaggerItem key={s.id}>
                      <div className={cn("card flex items-center gap-4 p-4", !s.open && "opacity-70")} data-testid={`session-${s.id}`}>
                        <DateBadge date={s.startsAt} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{s.name ? `${s.name} · ` : ""}{formatThaiSession(s.startsAt, s.endsAt)}</p>
                          <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {s.doorsOpen && (
                              <span className="inline-flex items-center gap-1">
                                <DoorOpen className="size-3.5" aria-hidden /> {L.doorsOpen} {formatThaiTime(s.doorsOpen)}
                              </span>
                            )}
                            {s.capacity !== null && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="size-3.5" aria-hidden /> {s.soldOut ? L.soldOut : Number.isFinite(s.remaining) && s.remaining <= 20 ? L.remaining(s.remaining) : `${s.capacity} ที่นั่ง`}
                              </span>
                            )}
                            {s.status === "cancelled" && <span className="text-destructive">ยกเลิกรอบ</span>}
                            {!s.open && s.status !== "cancelled" && <span>{L.ended}</span>}
                          </p>
                        </div>
                        {s.open && !s.soldOut && s.fromPrice !== null && openSessions.length > 1 && (
                          <Button asChild variant="outline" size="sm" className="hidden min-h-11 sm:inline-flex">
                            <Link href={`?session=${s.id}#buy`}>{L.pickSession}</Link>
                          </Button>
                        )}
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </Reveal>
            )}

            {ticketTypes.length > 0 && (
              <Reveal delay={0.05} className="mt-10">
                <h2 className="font-heading text-2xl font-semibold">{L.ticketTypes}</h2>
                <ul className="card mt-4 divide-y divide-border p-0" data-testid="ticket-types">
                  {ticketTypes.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-4 px-5 py-4" data-sale-state={t.saleState}>
                      <div className="min-w-0">
                        <p className="font-medium">{t.name}</p>
                        {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {t.sessionId && <span>{L.session} {sessions.find((s) => s.id === t.sessionId)?.name ?? formatThaiDateRange(sessions.find((s) => s.id === t.sessionId)!.startsAt, null)}</span>}
                          {t.saleState === "not_started" && t.salesStart && <span>{L.salesStartAt(formatThaiDateTime(t.salesStart))}</span>}
                          {t.saleState === "on_sale" && t.salesEnd && <span className="text-amber-700 dark:text-amber-300">{L.salesEndAt(formatThaiDateTime(t.salesEnd))}</span>}
                          {t.saleState === "on_sale" && Number.isFinite(t.remaining) && t.remaining <= 10 && <span className="font-medium text-amber-700 dark:text-amber-300">{L.remaining(t.remaining)}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-heading text-lg font-semibold tabular-nums text-primary">{t.price > 0 ? thb(t.price) : L.free}</span>
                        <SaleStateBadge state={t.saleState} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {(event.venueName || event.venueAddress) && (
              <Reveal delay={0.05} className="mt-10">
                <h2 className="font-heading text-2xl font-semibold">{L.where}</h2>
                <div className="card mt-4 overflow-hidden p-0">
                  {mapEmbed && <iframe src={mapEmbed} title={`แผนที่ ${event.venueName ?? ""}`} className="h-64 w-full md:h-80" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}
                  <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      <div>
                        {event.venueName && <p className="font-medium">{event.venueName}</p>}
                        {event.venueAddress && <p className="mt-0.5 text-sm text-muted-foreground">{event.venueAddress}</p>}
                      </div>
                    </div>
                    {mapLink && (
                      <Button asChild variant="outline" className="h-11">
                        <a href={mapLink} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" /> {L.directions}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </Reveal>
            )}

            {config.showOrganizerContact && (event.organizer || contact.phone || contact.lineId) && (
              <Reveal delay={0.05} className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-start gap-3">
                  <Megaphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="text-xs text-muted-foreground">{L.organizer}</p>
                    <p className="font-medium">{event.organizer ?? runtime.config.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.phone && (
                    <Button asChild variant="outline" className="h-11">
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="size-4" /> {contact.phone}
                      </a>
                    </Button>
                  )}
                  {(contact.lineUrl || contact.lineId) && (
                    <Button asChild variant="outline" className="h-11">
                      <a href={contact.lineUrl ?? `https://line.me/R/ti/p/${encodeURIComponent(contact.lineId!)}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-4" /> LINE {contact.lineId ?? ""}
                      </a>
                    </Button>
                  )}
                </div>
              </Reveal>
            )}

            {event.gallery.length > 0 && (
              <Reveal delay={0.05} className="mt-10">
                <h2 className="font-heading text-2xl font-semibold">{L.gallery}</h2>
                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                  {event.gallery.slice(0, 9).map((url, i) => (
                    <div key={url + i} className={cn("overflow-hidden rounded-[var(--radius-xl)]", i === 0 && "col-span-2 row-span-2")}>
                      <Img src={url} alt={`${event.title} ${i + 1}`} className="aspect-square size-full object-cover transition duration-700 hover:scale-105" />
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            <Reveal delay={0.05} className="mt-10 text-sm text-muted-foreground">
              <h2 className="font-heading text-lg font-semibold text-foreground">{L.terms}</h2>
              <p className="mt-2 whitespace-pre-line">{config.ticketTerms}</p>
            </Reveal>
          </div>

          <div id="buy" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
            <Reveal delay={0.1}>
              <TicketPicker event={{ id: event.id, slug: event.slug, title: event.title, status: event.status }} sessions={pickerSessions} config={{ maxPerOrder: config.maxPerOrder, allowGuestCheckout: config.allowGuestCheckout, holdMinutes: config.holdMinutes, ticketTerms: config.ticketTerms }} methods={methods} customer={customer ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email } : null} initialSessionId={sp.session ?? null} loginHref={`/account/login?next=${encodeURIComponent(`/events/${event.slug}`)}`} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* phone: sticky buy bar above the fold; the widget itself sits under the details */}
      {live && onSale && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden print:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }} data-testid="buy-bar">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <PriceFrom price={fromPrice} soldOut={soldOut} size="sm" />
            <Button asChild size="lg">
              <a href="#buy">
                <Ticket className="size-4" /> {L.buyTickets}
              </a>
            </Button>
          </div>
        </div>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    </PageBody>
  );
}
