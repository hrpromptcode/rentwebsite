import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight, CalendarDays, MapPin, Ticket } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Magnetic, Parallax, Reveal, Stagger, StaggerItem, TextReveal, TiltCard } from "@rentweb/ui/motion";
import { Img, SmartLink } from "@rentweb/storefront";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { eventHero } from "@rentweb/storefront/definitions";
import { thb } from "@rentweb/core/money";
import { Countdown } from "../components/countdown";
import { eventCardStats, listPublicEvents } from "../services/catalog";
import { formatThaiSession } from "../services/time";
import { L } from "../labels";

type Props = z.output<typeof eventHero.schema>;

/**
 * Featured-event hero: the featured (or next) published upcoming event as a full-bleed poster with date / venue chips,
 * a live countdown and "ซื้อบัตร". Falls back to a plain hero (heading + image) when nothing is on sale.
 * First section of the home page → data-hero-dark switches a transparent header to light text.
 */
export async function EventHeroSection({ ctx, props: p, id, index }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const data = await withTenant(getDb(), tenantId, async (tx) => {
    let [ev] = await listPublicEvents(tx, tenantId, { scope: "upcoming", limit: 1, featuredOnly: p.source === "featured", order: p.source === "next" ? "start_asc" : undefined });
    if (!ev && p.source === "featured") [ev] = await listPublicEvents(tx, tenantId, { scope: "upcoming", limit: 1 });
    if (!ev) return null;
    const stats = (await eventCardStats(tx, tenantId, [ev.id])).get(ev.id) ?? null;
    return { ev, stats };
  });

  const transparentHeader = ctx.theme.layout.headerTransparent && index === 0;
  const heading = p.heading || data?.ev.title || ctx.tenant.name;
  const subheading = p.subheading || data?.ev.summary || "";
  const eyebrow = p.eyebrow || data?.ev.category || "";
  const image = data?.ev.cover || p.image.url;
  const alt = data?.ev.cover ? data.ev.title : p.image.alt;
  const href = data ? `/events/${encodeURIComponent(data.ev.slug)}` : "/events";
  const session = data?.stats?.nextSession ?? null;
  const start = session?.startsAt ?? data?.ev.startsAt ?? null;
  const end = session?.endsAt ?? data?.ev.endsAt ?? null;
  const soldOut = !!data?.stats?.soldOut;
  const fromPrice = data?.stats?.fromPrice ?? null;

  const chips = data ? (
    <Stagger className="mt-6 flex flex-wrap gap-2" stagger={0.05} delay={0.3}>
      {start && (
        <StaggerItem>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-sm text-white backdrop-blur">
            <CalendarDays className="size-4" aria-hidden /> {formatThaiSession(start, end)}
          </span>
        </StaggerItem>
      )}
      {data.ev.venueName && (
        <StaggerItem>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-sm text-white backdrop-blur">
            <MapPin className="size-4" aria-hidden /> {data.ev.venueName}
          </span>
        </StaggerItem>
      )}
      {soldOut && (
        <StaggerItem>
          <span className="inline-flex min-h-9 items-center rounded-full bg-destructive px-3 py-1 text-sm font-semibold text-destructive-foreground">{L.soldOut}</span>
        </StaggerItem>
      )}
    </Stagger>
  ) : null;

  const ctas = (dark: boolean) => (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Magnetic strength={0.2}>
        <Button asChild size="xl" className={cn(dark && "shadow-lg shadow-black/30")} data-testid="hero-cta">
          <Link href={href}>
            <Ticket className="size-5" /> {data ? (soldOut ? L.viewEvent : p.ctaLabel) : L.browse}
            {data && !soldOut && fromPrice !== null && fromPrice > 0 && <span className={cn("ml-1 text-sm font-normal", dark ? "opacity-80" : "opacity-70")}>· {L.from} {thb(fromPrice)}</span>}
          </Link>
        </Button>
      </Magnetic>
      <Button asChild size="xl" variant={dark ? "inverse" : "outline"} className={cn(dark && "bg-white/10 text-white backdrop-blur hover:bg-white/20 !border-white/30")}>
        <SmartLink href={p.secondaryCta?.href || "/events"}>{p.secondaryCta?.label || L.allEvents}</SmartLink>
      </Button>
    </div>
  );

  if (p.variant === "split") {
    return (
      <section id={id} className={cn("relative isolate overflow-hidden", transparentHeader ? "pt-28 md:pt-36" : "pt-12 md:pt-20", "pb-16 md:pb-24")}>
        <div className="container-x relative grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {eyebrow && (
              <Reveal>
                <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-primary-ink uppercase">{eyebrow}</p>
              </Reveal>
            )}
            {p.textReveal ? <TextReveal as="h1" text={heading} className="heading-display text-5xl font-semibold md:text-6xl xl:text-7xl" delay={0.1} /> : <h1 className="heading-display text-5xl font-semibold md:text-6xl xl:text-7xl">{heading}</h1>}
            {subheading && (
              <Reveal delay={0.35}>
                <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">{subheading}</p>
              </Reveal>
            )}
            {data && start && (
              <Reveal delay={0.4} className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-primary" aria-hidden /> {formatThaiSession(start, end)}
                </span>
                {data.ev.venueName && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 text-primary" aria-hidden /> {data.ev.venueName}
                  </span>
                )}
              </Reveal>
            )}
            {p.showCountdown && start && (
              <Reveal delay={0.45} className="mt-6">
                <Countdown to={start.toISOString()} endsAt={end?.toISOString()} />
              </Reveal>
            )}
            <Reveal delay={0.5}>{ctas(false)}</Reveal>
          </div>
          <Reveal delay={0.2} direction="scale" className="relative lg:col-span-6">
            <TiltCard max={5} className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[var(--radius-3xl)] bg-glow/40 blur-3xl" />
              <Img src={image} alt={alt} className="aspect-[4/5] w-full rounded-[var(--radius-2xl)] object-cover shadow-2xl md:aspect-square" priority />
            </TiltCard>
          </Reveal>
        </div>
      </section>
    );
  }

  // fullscreen poster (default)
  return (
    <section id={id} data-hero-dark={index === 0 ? "" : undefined} className="relative isolate flex min-h-[92svh] items-end overflow-hidden text-white" data-testid="event-hero">
      <div className="absolute inset-0 -z-10">
        <Parallax speed={0.25} scale className="h-full">
          <Img src={image} alt={alt} className="size-full object-cover" priority />
        </Parallax>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/15" style={{ opacity: Math.max(0.6, p.overlay + 0.3) }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
      </div>
      <div className="container-x relative pb-16 pt-32 md:pb-24 md:pt-40">
        <div className="max-w-3xl">
          {eyebrow && (
            <Reveal>
              <p className="mb-4 text-xs font-semibold tracking-[0.3em] text-white/80 uppercase">{eyebrow}</p>
            </Reveal>
          )}
          {p.textReveal ? <TextReveal as="h1" text={heading} className="heading-display text-5xl font-semibold text-white md:text-7xl lg:text-8xl" delay={0.1} /> : <h1 className="heading-display text-5xl font-semibold text-white md:text-7xl lg:text-8xl">{heading}</h1>}
          {subheading && (
            <Reveal delay={0.35}>
              <p className="mt-6 max-w-xl text-lg text-white/85 md:text-xl">{subheading}</p>
            </Reveal>
          )}
          {chips}
          {p.showCountdown && start && (
            <Reveal delay={0.45} className="mt-8">
              <Countdown to={start.toISOString()} endsAt={end?.toISOString()} dark />
            </Reveal>
          )}
          <Reveal delay={0.55}>{ctas(true)}</Reveal>
        </div>
      </div>
    </section>
  );
}
