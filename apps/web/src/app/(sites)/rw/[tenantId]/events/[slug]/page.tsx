import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock, DoorOpen, ExternalLink, MapPin, Megaphone, MessageCircle, Phone, Ticket, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { LiveClock, ParallaxMedia, Reveal } from "@rentweb/ui/motion";
import { ScenePoster } from "@rentweb/ui/three";
import { Eyebrow, Img, Prose, SectionStyles, StaggerCell, StaggerList } from "@rentweb/storefront";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { serializeJsonLd } from "@rentweb/core";
import { thb } from "@rentweb/core/money";
import { eventsConfig, getPublicEvent, sanitizeHtml, ticketPaymentMethods } from "@rentweb/module-events/services";
import { DateStamp, EvStyles, ThaiWrap, EventStatusBadge, L, METHOD_LABELS, PriceFrom, SaleStateBadge, dotDate, formatThaiDate, formatThaiDateRange, formatThaiDateTime, formatThaiSession, formatThaiTime, hhmm } from "@rentweb/module-events/ui";
import { Countdown, EvTilt, TicketPicker, type PickerSession } from "@rentweb/module-events/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

type Params = Promise<{ tenantId: string; slug: string }>;
type Search = Promise<{ session?: string }>;

const htmlClass =
  "text-step-0 leading-[1.8] text-foreground/85 [&_p]:mb-5 [&_ul]:mb-5 [&_ul]:list-none [&_ul]:pl-0 [&_ul>li]:relative [&_ul>li]:pl-6 [&_ul>li]:before:absolute [&_ul>li]:before:left-0 [&_ul>li]:before:top-[.8em] [&_ul>li]:before:h-px [&_ul>li]:before:w-3 [&_ul>li]:before:bg-primary [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5 [&_h2]:font-heading [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-step-2 [&_h2]:font-semibold [&_h3]:font-heading [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-step-1 [&_h3]:font-semibold [&_h3]:text-foreground [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_hr]:my-8";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) return {};
  const detail = await tenantTx(tenantId, (tx) => getPublicEvent(tx, tenantId, decodeSlug(slug)));
  if (!detail) return {};
  const e = detail.event;
  return { title: e.title, description: e.summary ?? undefined, openGraph: e.cover ? { images: [{ url: e.cover }] } : undefined };
}

const bkkYear = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(d));
const finite = (n: number) => (Number.isFinite(n) ? n : null);
const script = (s: string) => (/[฀-๿]/.test(s) ? (/[A-Za-z]/.test(s) ? "mixed" : "thai") : "latin");
function splitTitle(t: string): [string, string] {
  const m = t.match(/^(.{3,40}?)\s*(?::|—|–|\s-\s)\s*(.{3,})$/);
  return m ? [m[1]!.trim(), m[2]!.trim()] : [t, ""];
}

/**
 * /events/[slug]?session=<id> — parallax poster hero (giant title, accent-font date, odometer countdown) with the box
 * office (buy widget) rising into it on desktop and sticking while the details scroll; details as a perforated ticket
 * strip, ticket tiers as CSS tickets (tilt + holo on hover), sessions, map, organiser, gallery, terms. The buy widget
 * itself stays calm (every data-testid kept). Phones get a ticket-stub buy bar.
 */
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
  const doors = next?.doorsOpen ?? null;
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
  const [head, tail] = splitTitle(event.title);
  const longHead = [...head.replace(/\s+/g, "")].length > 18;
  const multi = openSessions.length > 1;
  const gallery = event.gallery.slice(0, 9);

  return (
    <div>
      {/* the poster hero paints under the (transparent) header itself → no PageBody top padding */}
      <EvStyles />
      <SectionStyles />
      {/* ------------------------------------------------------------------ hero ------------------------------------ */}
      <section data-hero-dark="" className="rw-hero relative isolate flex min-h-[min(86svh,860px)] flex-col justify-end overflow-clip bg-[#07070a] text-white md:min-h-[min(88svh,900px)]">
        <div className="absolute inset-0 -z-10">
          <ParallaxMedia speed={-0.12} scale={1.12} className="absolute inset-0" innerClassName="size-full">
            <Img src={event.cover ?? ""} alt={event.title} className={cn("size-full object-cover", !live && "grayscale-[.6]")} priority sizes="100vw" />
          </ParallaxMedia>
          <div className="ev-scrim absolute inset-0" />
          <div className="absolute inset-0 opacity-70 mix-blend-screen">
            <ScenePoster variant="stage" grain={0.05} style={{ background: "transparent" }} />
          </div>
        </div>
        <div className="absolute inset-x-0 top-0 z-10 pt-[calc(var(--header-h,72px)+0.75rem)] md:pt-[calc(var(--header-h,80px)+1.25rem)]">
          <div className="container-x flex items-center justify-between gap-6">
            <Link href="/events" className="group inline-flex h-11 items-center gap-2 text-sm text-white/80 transition-colors hover:text-white">
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden /> {L.allEvents}
            </Link>
            <span className="ev-mono hidden items-center gap-5 text-white/65 md:flex">
              {event.category && <span data-script={script(event.category)}>{event.category}</span>}
              {start && <span>{dotDate(start)}.{String(bkkYear(start)).slice(2)}</span>}
              <LiveClock label="BKK" />
            </span>
          </div>
        </div>
        <div className="container-x relative pt-[calc(var(--header-h,72px)+5.5rem)] pb-10 md:pb-14">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Eyebrow text={[event.organizer ?? runtime.config.name, event.category].filter(Boolean).join(" · ")} tone="inherit" className="ev-in mb-5 text-white/80" />
              <h1 className="font-heading" data-testid="event-title" data-script={script(event.title)}>
                <span className="ev-giant ev-in block text-balance [text-shadow:0_4px_40px_rgba(0,0,0,.35)]" data-script={script(head)} style={{ fontSize: longHead || tail === "" ? "clamp(2.25rem, 1.2rem + 3.8vw, 5rem)" : "clamp(3rem, 1.2rem + 5.4vw, 7rem)", "--d": ".1s" } as React.CSSProperties}>
                  <ThaiWrap text={head} />
                </span>
                {tail && (
                  <span className="ev-hero-sub ev-in mt-2 block font-semibold text-balance text-white/90 md:mt-3" data-script={script(tail)} style={{ "--d": ".2s" } as React.CSSProperties}>
                    <ThaiWrap text={tail} />
                  </span>
                )}
              </h1>
              {event.summary && (
                <p className="ev-in mt-5 max-w-2xl text-[15px] leading-relaxed text-white/75 md:text-base" style={{ "--d": ".3s" } as React.CSSProperties}>
                  {event.summary}
                </p>
              )}
              <div className="ev-in mt-6 flex flex-wrap items-end gap-x-8 gap-y-5 md:mt-8" style={{ "--d": ".4s" } as React.CSSProperties}>
                {start && (
                  <span className="flex items-end gap-3">
                    <span aria-hidden className="ev-num text-[clamp(2.25rem,1.7rem+1.6vw,3.5rem)] font-bold text-primary">{dotDate(start)}</span>
                    <span className="pb-0.5 text-sm leading-tight">
                      <span className="block text-white/70">{multi ? L.sessionsN(openSessions.length) : formatThaiDate(start)}</span>
                      <span className="ev-num block text-base font-semibold">
                        {hhmm(start)}
                        {end ? `–${hhmm(end)}` : ""}
                      </span>
                    </span>
                    <span className="sr-only">{multi ? `${formatThaiDateRange(openSessions[0]!.startsAt, openSessions[openSessions.length - 1]!.endsAt)} · ${L.sessionsN(openSessions.length)}` : formatThaiSession(start, end)}</span>
                  </span>
                )}
                {live && start && <Countdown to={start.toISOString()} endsAt={end?.toISOString()} dark size="sm" />}
              </div>
              {event.status === "cancelled" && (
                <p className="mt-6 inline-flex items-start gap-3 rounded-[var(--radius-lg)] border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-100" role="status">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden /> {L.eventCancelled}
                </p>
              )}
              {event.status === "ended" && (
                <p className="mt-6 inline-flex items-start gap-3 rounded-[var(--radius-lg)] bg-white/10 px-4 py-3 text-sm text-white/85 backdrop-blur" role="status">
                  <Clock className="mt-0.5 size-5 shrink-0" aria-hidden /> {L.eventEnded}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ body ------------------------------------ */}
      <section className={cn("container-x relative z-10 pt-10 md:pt-14", onSale ? "pb-32 md:pb-28" : "pb-16 md:pb-28")}>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
          {/* box office: rises into the hero on desktop, sticks while the details scroll */}
          <div id="buy" className="scroll-mt-24 lg:sticky lg:top-24 lg:order-2 lg:col-span-5 lg:-mt-[min(42svh,420px)] lg:self-start">
            <div className="relative">
              <div className="ev-mono mb-3 flex items-center justify-between gap-3 text-muted-foreground lg:text-white/75">
                <span>Box office</span>
                {multi && <span data-script="thai">{L.sessionsN(openSessions.length)}</span>}
              </div>
              <TicketPicker event={{ id: event.id, slug: event.slug, title: event.title, status: event.status }} sessions={pickerSessions} config={{ maxPerOrder: config.maxPerOrder, allowGuestCheckout: config.allowGuestCheckout, holdMinutes: config.holdMinutes, ticketTerms: config.ticketTerms }} methods={methods} customer={customer ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email } : null} initialSessionId={sp.session ?? null} loginHref={`/account/login?next=${encodeURIComponent(`/events/${event.slug}`)}`} className="shadow-float" />
            </div>
          </div>

          <div className="min-w-0 lg:order-1 lg:col-span-7">
            {/* perforated info strip */}
            <Reveal>
              <dl className="ev-strip ev-ticket-bg ev-ticket-edge grid overflow-hidden rounded-[calc(var(--radius)*1.4)] sm:grid-cols-3" data-testid="event-strip">
                <div className="p-5 md:p-6">
                  <dt className="ev-mono text-muted-foreground" data-script="thai">{L.when}</dt>
                  <dd className="mt-2 font-semibold">{start ? (multi ? formatThaiDateRange(openSessions[0]!.startsAt, openSessions[openSessions.length - 1]!.endsAt) : formatThaiDate(start, "long")) : "ประกาศวันเร็ว ๆ นี้"}</dd>
                  {start && <dd className="ev-num mt-1 text-lg font-bold">{hhmm(start)}{end ? `–${hhmm(end)}` : ""}</dd>}
                </div>
                <div className="p-5 md:p-6">
                  <dt className="ev-mono text-muted-foreground" data-script="thai">{L.doorsOpen}</dt>
                  <dd className="ev-num mt-2 text-lg font-bold">{doors ? hhmm(doors) : "—"}</dd>
                  <dd className="mt-1 text-sm text-muted-foreground">{multi ? L.sessionsN(openSessions.length) : doors ? formatThaiTime(doors) : ""}</dd>
                </div>
                <div className="p-5 md:p-6">
                  <dt className="ev-mono text-muted-foreground" data-script="thai">{L.venue}</dt>
                  <dd className="mt-2 font-semibold leading-snug">{event.venueName ?? "—"}</dd>
                </div>
              </dl>
            </Reveal>

            {event.description && (
              <Reveal className="mt-14 md:mt-20">
                <h2 className="font-heading text-step-3 font-semibold">{L.aboutEvent}</h2>
                {isHtml ? <div className={`mt-6 ${htmlClass}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.description) }} /> : <Prose text={event.description} className="mt-6 text-step-0 leading-[1.8] text-foreground/85" />}
              </Reveal>
            )}

            {ticketTypes.length > 0 && (
              <div className="mt-14 md:mt-20">
                <Reveal>
                  <h2 className="font-heading text-step-3 font-semibold">{L.ticketTypes}</h2>
                </Reveal>
                <StaggerList className="mt-6 grid gap-4" stagger={0.07}>
                  {ticketTypes.map((t) => {
                    const on = t.saleState === "on_sale";
                    const sess = t.sessionId ? sessions.find((s) => s.id === t.sessionId) : null;
                    return (
                      <StaggerCell key={t.id}>
                        <EvTilt max={4} className="rounded-[calc(var(--radius)*1.25)]" data-sale-state={t.saleState}>
                          <div className={cn("ev-ticket-x ev-ticket-bg ev-ticket-edge ev-tier grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-[calc(var(--radius)*1.25)]", !on && "opacity-75")} style={{ "--at": "50%" } as React.CSSProperties} data-on={on ? "" : undefined}>
                            <div className="min-w-0 p-5 md:p-6">
                              <p className="font-heading text-lg leading-snug font-semibold md:text-xl">{t.name}</p>
                              {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {sess && <span>{L.session} {sess.name ?? formatThaiDateRange(sess.startsAt, null)}</span>}
                                {t.saleState === "not_started" && t.salesStart && <span>{L.salesStartAt(formatThaiDateTime(t.salesStart))}</span>}
                                {on && t.salesEnd && <span className="text-amber-700 dark:text-amber-300">{L.salesEndAt(formatThaiDateTime(t.salesEnd))}</span>}
                                {on && Number.isFinite(t.remaining) && t.remaining <= 10 && <span className="font-medium text-amber-700 dark:text-amber-300">{L.remaining(t.remaining)}</span>}
                              </p>
                            </div>
                            <div className="ev-perf-v flex min-w-[8.5rem] flex-col items-end justify-center gap-2 p-5 text-right md:min-w-[10rem] md:p-6">
                              <span className={cn("ev-num text-2xl font-bold md:text-[1.75rem]", on ? "ev-ink" : "text-muted-foreground")}>{t.price > 0 ? thb(t.price) : L.free}</span>
                              <SaleStateBadge state={t.saleState} />
                            </div>
                            {on && <span aria-hidden className="ev-holo" />}
                          </div>
                        </EvTilt>
                      </StaggerCell>
                    );
                  })}
                </StaggerList>
              </div>
            )}

            {sessions.length > 0 && (
              <div className="mt-14 md:mt-20">
                <Reveal>
                  <h2 className="font-heading text-step-3 font-semibold">{L.sessions}</h2>
                </Reveal>
                <StaggerList className="mt-6 grid border-t ev-hair" stagger={0.05}>
                  {sessions.map((s, i) => (
                    <StaggerCell key={s.id}>
                      <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-2 border-b ev-hair py-5 sm:grid-cols-[2.5rem_auto_minmax(0,1fr)_auto]", !s.open && "opacity-60")} data-testid={`session-${s.id}`}>
                        <span className="ev-mono hidden text-muted-foreground sm:block">{String(i + 1).padStart(2, "0")}</span>
                        <DateStamp date={s.startsAt} className="ev-ink [&_b]:!text-[2rem]" />
                        <div className="min-w-0">
                          <p className="font-medium">
                            {s.name ? `${s.name} · ` : ""}
                            {formatThaiSession(s.startsAt, s.endsAt)}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
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
                        {s.open && !s.soldOut && s.fromPrice !== null && multi && (
                          <Button asChild variant="outline" size="sm" className="col-span-2 min-h-11 justify-self-start rounded-full sm:col-span-1 sm:justify-self-end">
                            <Link href={`?session=${s.id}#buy`} scroll={false}>
                              {L.pickSession}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </StaggerCell>
                  ))}
                </StaggerList>
              </div>
            )}

            {(event.venueName || event.venueAddress) && (
              <Reveal className="mt-14 md:mt-20">
                <h2 className="font-heading text-step-3 font-semibold">{L.where}</h2>
                <div className="mt-6 overflow-hidden rounded-[calc(var(--radius)*1.4)] border ev-hair bg-card">
                  {mapEmbed && (
                    <div className="relative isolate h-64 md:h-80">
                      <iframe src={mapEmbed} title={`แผนที่ ${event.venueName ?? ""}`} className="absolute inset-0 size-full grayscale contrast-[1.05] dark:invert-[.9] dark:contrast-[.95]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--primary)_22%,transparent)] mix-blend-multiply dark:bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] dark:mix-blend-soft-light" />
                    </div>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
                    <div className="flex items-start gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <MapPin className="size-5" aria-hidden />
                      </span>
                      <div>
                        {event.venueName && <p className="font-semibold">{event.venueName}</p>}
                        {event.venueAddress && <p className="mt-0.5 text-sm text-muted-foreground">{event.venueAddress}</p>}
                      </div>
                    </div>
                    {mapLink && (
                      <Button asChild variant="outline" className="h-11 rounded-full">
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
              <Reveal className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[calc(var(--radius)*1.4)] border ev-hair p-5 md:p-6">
                <div className="flex items-start gap-3">
                  <Megaphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="ev-mono text-muted-foreground" data-script="thai">{L.organizer}</p>
                    <p className="mt-1 font-semibold">{event.organizer ?? runtime.config.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.phone && (
                    <Button asChild variant="outline" className="h-11 rounded-full">
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="size-4" /> {contact.phone}
                      </a>
                    </Button>
                  )}
                  {(contact.lineUrl || contact.lineId) && (
                    <Button asChild variant="outline" className="h-11 rounded-full">
                      <a href={contact.lineUrl ?? `https://line.me/R/ti/p/${encodeURIComponent(contact.lineId!)}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-4" /> LINE {contact.lineId ?? ""}
                      </a>
                    </Button>
                  )}
                </div>
              </Reveal>
            )}

            {gallery.length > 0 && (
              <div className="mt-14 md:mt-20">
                <Reveal>
                  <h2 className="font-heading text-step-3 font-semibold">{L.gallery}</h2>
                </Reveal>
                <StaggerList className={cn("mt-6 grid grid-cols-3 gap-2.5 md:gap-3", gallery.length > 4 && "md:grid-cols-4")} stagger={0.06}>
                  {gallery.map((url, i) => (
                    <StaggerCell key={url + i} className={cn(i === 0 && cn("col-span-3 md:col-span-2", gallery.length === 4 ? "md:row-span-3" : gallery.length === 3 || gallery.length > 4 ? "md:row-span-2" : ""))}>
                      <div className="group h-full overflow-hidden rounded-[calc(var(--radius)*1.25)] bg-muted">
                        <Img src={url} alt={`${event.title} ${i + 1}`} className={cn("size-full object-cover grayscale-[.4] transition duration-700 group-hover:scale-105 group-hover:grayscale-0", i === 0 ? "aspect-[16/10] md:aspect-auto md:h-full" : "aspect-square")} />
                      </div>
                    </StaggerCell>
                  ))}
                </StaggerList>
              </div>
            )}

            <Reveal className="mt-14 border-t ev-hair pt-8 text-sm text-muted-foreground md:mt-20">
              <h2 className="font-heading text-lg font-semibold text-foreground">{L.terms}</h2>
              <p className="mt-3 max-w-2xl leading-relaxed whitespace-pre-line">{config.ticketTerms}</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* phone: ticket-stub buy bar; the widget itself sits after the hero */}
      {live && onSale && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden print:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }} data-testid="buy-bar" data-sticky-bar="lg">
          <div className="ev-ticket-x mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border ev-hair bg-card/95 py-2.5 pr-2.5 pl-5 shadow-float backdrop-blur" style={{ "--at": "50%", "--notch": "9px" } as React.CSSProperties}>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{head}</p>
              <PriceFrom price={fromPrice} soldOut={soldOut} size="sm" />
            </div>
            <Button asChild size="lg" className="shrink-0 rounded-full">
              <a href="#buy">
                <Ticket className="size-4" /> {L.buyTickets}
              </a>
            </Button>
          </div>
        </div>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    </div>
  );
}
