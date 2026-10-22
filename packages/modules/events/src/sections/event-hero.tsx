import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { LiveClock, Magnetic, Reveal, RollText, SplitReveal } from "@rentweb/ui/motion";
import { StageLights } from "@rentweb/ui/three";
import { Eyebrow, Img, SectionStyles, SmartLink } from "@rentweb/storefront";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { eventHero } from "@rentweb/storefront/definitions";
import { thb } from "@rentweb/core/money";
import { Countdown } from "../components/countdown";
import { dotDate, hhmm } from "../components/event-card";
import { EvStyles } from "../components/ev-styles";
import { StageTicketScene } from "../components/stage-ticket-scene";
import { eventCardStats, listPublicEvents } from "../services/catalog";
import { formatThaiDate, formatThaiSession } from "../services/time";
import { L } from "../labels";

type Props = z.output<typeof eventHero.schema>;

const isThai = (s: string) => /[฀-๿]/.test(s);
const script = (s: string) => (isThai(s) ? (/[A-Za-z]/.test(s) ? "mixed" : "thai") : "latin");
const glen = (s: string) => [...s.replace(/\s+/g, "")].length;

/** "Riverside Live: โฟล์กกลางแจ้งริมเจ้าพระยา" → ["Riverside Live", "โฟล์กกลางแจ้งริมเจ้าพระยา"] (poster head + tagline). */
function splitTitle(t: string): [string, string] {
  if (t.includes("\n")) {
    const [a, ...rest] = t.split("\n");
    return [a!.trim(), rest.join(" ").trim()];
  }
  const m = t.match(/^(.{3,40}?)\s*(?::|—|–|\s-\s)\s*(.{3,})$/);
  return m ? [m[1]!.trim(), m[2]!.trim()] : [t, ""];
}

/**
 * Featured-event hero (§5.10 signature): full-bleed dimmed photo, volumetric stage beams sweeping over it and a
 * holographic 3D ticket of the featured event (one canvas), giant poster type, an odometer countdown and "ซื้อบัตร ·
 * เริ่มต้น ฿890" above the fold. Falls back to a plain hero (heading + image + beams) when nothing is on sale.
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
  const [head, tail] = splitTitle(heading);
  const longHead = glen(head) > 18;
  const venueShort = data?.ev.venueName ? (data.ev.venueName.length > 34 ? `${data.ev.venueName.split("·")[0]!.trim()}` : data.ev.venueName) : undefined;
  const expressive = (ctx.theme.effects as { motionLevel?: string }).motionLevel !== "subtle";
  const sceneOff = (ctx.theme.effects as { scene3d?: string }).scene3d === "off";

  const ctaLabel = data ? (soldOut ? L.viewEvent : p.ctaLabel) : L.browse;
  const priceTag = data && !soldOut && fromPrice !== null && fromPrice > 0 ? `${L.from} ${thb(fromPrice)}` : null;

  const title = (dark: boolean) => (
    <h1 className={cn("font-heading", dark && "text-white")} data-script={script(heading)}>
      {p.textReveal ? (
        <SplitReveal as="span" text={head} mode="words" from="mask" trigger="mount" delay={0.15} className={cn("ev-giant ev-hero-title block text-balance", dark && "[text-shadow:0_4px_40px_rgba(0,0,0,.35)]")} {...(longHead ? { style: { fontSize: "clamp(2.5rem, 1.2rem + 4.4vw, 5.75rem)" } } : {})} />
      ) : (
        <span className="ev-giant ev-hero-title block text-balance" data-script={script(head)} style={longHead ? { fontSize: "clamp(2.5rem, 1.2rem + 4.4vw, 5.75rem)" } : undefined}>
          {head}
        </span>
      )}
      {tail && (
        <span className={cn("ev-hero-sub ev-in mt-2 block font-semibold text-balance md:mt-4", dark ? "text-white/90" : "text-foreground/85")} data-script={script(tail)} style={{ "--d": ".3s" } as React.CSSProperties}>
          {tail}
        </span>
      )}
    </h1>
  );

  const ctas = (dark: boolean) => (
    <div className="mt-6 flex flex-wrap items-center gap-3 md:mt-8">
      <Magnetic strength={0.25} max={10} className="inline-flex">
        <Button asChild size="xl" className={cn("rw-cta group/cta gap-2.5 pr-6", dark && "shadow-[0_18px_50px_-18px_var(--primary)]")} data-testid="hero-cta">
          <Link href={href}>
            <Ticket className="size-5" aria-hidden />
            <span data-magnetic-inner="" className="inline-flex">
              <RollText>{ctaLabel}</RollText>
            </span>
            {priceTag && <span className={cn("ml-0.5 border-l pl-3 text-sm font-medium", dark ? "border-current/30 opacity-85" : "border-current/30 opacity-75")}>{priceTag}</span>}
          </Link>
        </Button>
      </Magnetic>
      <Button asChild size="xl" variant={dark ? "inverse" : "outline"} className={cn("max-sm:hidden", dark && "!border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20")}>
        <SmartLink href={p.secondaryCta?.href || "/events"}>
          <RollText>{p.secondaryCta?.label || L.allEvents}</RollText>
        </SmartLink>
      </Button>
    </div>
  );

  const whenRow = (dark: boolean, animate: boolean) =>
    data && start ? (
      <div className={cn("mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-7", dark ? "text-white" : "text-foreground", animate && "ev-in")} style={{ "--d": ".35s" } as React.CSSProperties}>
        <span className="flex items-end gap-3">
          <span aria-hidden className={cn("ev-num text-[clamp(2rem,1.6rem+1.6vw,3.25rem)] font-bold", dark ? "text-primary" : "ev-ink")}>{dotDate(start)}</span>
          <span className="pb-0.5 text-sm leading-tight">
            <span className={cn("block", dark ? "text-white/70" : "text-muted-foreground")}>{formatThaiDate(start)}</span>
            <span className="ev-num block text-base font-semibold">
              {hhmm(start)}
              {end ? `–${hhmm(end)}` : ""}
            </span>
          </span>
          <span className="sr-only">{formatThaiSession(start, end)}</span>
        </span>
        {data.ev.venueName && (
          <span className={cn("ev-chip max-w-full text-[13px] md:text-sm", dark ? "ev-glass" : "border ev-hair")}>
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden /> <span className="truncate">{data.ev.venueName}</span>
          </span>
        )}
        {soldOut && <span className="ev-chip bg-destructive font-semibold text-destructive-foreground">{L.soldOut}</span>}
      </div>
    ) : null;

  /* ------------------------------------------------------------------ split ------------------------------------- */
  if (p.variant === "split") {
    const transparentHeader = ctx.theme.layout.headerTransparent && index === 0;
    return (
      <section id={id} data-testid="event-hero" data-section="event-hero" data-variant="split" className={cn("rw-hero relative isolate overflow-clip", transparentHeader ? "pt-28 md:pt-36" : "pt-12 md:pt-20", "pb-16 md:pb-24")}>
        <SectionStyles />
        <EvStyles />
        <div className="container-x relative grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            {eyebrow && <Eyebrow text={eyebrow} className="mb-6" />}
            {title(false)}
            {subheading && (
              <Reveal delay={0.3}>
                <p className="mt-6 line-clamp-3 max-w-xl text-step-1 leading-relaxed text-muted-foreground">{subheading}</p>
              </Reveal>
            )}
            {whenRow(false, false)}
            {p.showCountdown && start && (
              <Reveal delay={0.45} className="mt-7">
                <Countdown to={start.toISOString()} endsAt={end?.toISOString()} />
              </Reveal>
            )}
            <Reveal delay={0.5}>{ctas(false)}</Reveal>
          </div>
          <Reveal delay={0.15} direction="scale" className="relative lg:col-span-5">
            <div className="relative aspect-[4/5] overflow-clip rounded-[calc(var(--radius)*2)] bg-[#0b0b0f] shadow-float">
              <Img src={image} alt={alt} className="absolute inset-0 size-full object-cover opacity-55" priority />
              <div className="ev-scrim absolute inset-0" />
              {data && !sceneOff ? (
                <StageTicketScene title={head} date={start ? `${formatThaiDate(start)} · ${hhmm(start)}` : ""} venue={venueShort} price={priceTag ?? undefined} code="ADMIT ONE" placement="center" />
              ) : (
                !sceneOff && <StageLights className="absolute inset-0" beams={4} />
              )}
            </div>
          </Reveal>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ fullscreen (default) ------------------------ */
  return (
    <>
      <section
        id={id}
        data-section="event-hero"
        data-variant="fullscreen"
        data-hero-dark={index === 0 ? "" : undefined}
        className="rw-hero relative isolate flex min-h-[max(100svh,640px)] flex-col justify-end overflow-clip bg-[#07070a] text-white md:min-h-[max(100svh,720px)]"
        data-testid="event-hero"
      >
        <SectionStyles />
        <EvStyles />
        {/* photo (slow push-in + scroll drift), scrim, stage beams + 3D ticket (one canvas), scroll darken */}
        <div className="absolute inset-0 -z-10 overflow-clip">
          <div className={cn("absolute inset-0", expressive && "rw-push rw-drift")}>
            <Img src={image} alt={alt} className="size-full object-cover opacity-80 saturate-[.85]" priority sizes="100vw" />
          </div>
          <div className="ev-scrim absolute inset-0" />
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_10%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%),radial-gradient(50%_45%_at_95%_95%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_70%)]" />
        </div>
        {!sceneOff &&
          (data ? (
            <StageTicketScene title={head} date={start ? `${formatThaiDate(start)} · ${hhmm(start)}` : ""} venue={venueShort} price={priceTag ?? undefined} code="ADMIT ONE" className="absolute inset-0 z-0" />
          ) : (
            <div className="pointer-events-none absolute inset-0 z-0">
              <StageLights beams={5} haze sweep={0.4} floor="none" />
            </div>
          ))}
        <div aria-hidden className="rw-darken pointer-events-none absolute inset-0 z-[1] bg-black" />

        {/* corner meta */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 pt-[calc(var(--header-h,72px)+1.25rem)] md:pt-[calc(var(--header-h,80px)+1.75rem)]">
          <div className="container-x flex items-center justify-between gap-6 text-white/70">
            <span className="ev-mono flex min-w-0 items-center gap-3">
              <span className="relative flex size-2 shrink-0" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="truncate">{data ? (data.ev.featured ? "Featured event" : "Next up") : "On stage"}</span>
              {data?.ev.category && (
                <span className="hidden truncate md:inline" data-script={script(data.ev.category)}>
                  / {data.ev.category}
                </span>
              )}
            </span>
            <span className="ev-mono hidden items-center gap-5 md:flex">
              {start && <span>{dotDate(start)}.{String(new Date(start).getUTCFullYear()).slice(2)}</span>}
              <LiveClock label="BKK" />
            </span>
          </div>
        </div>

        {/* copy */}
        <div className="pointer-events-none relative z-10 pb-10 md:pb-14">
          <div className="container-x">
            <div className="pointer-events-auto max-w-[44rem] lg:max-w-[min(50rem,54%)]">
              {eyebrow && <Eyebrow text={eyebrow} tone="inherit" className="ev-in mb-5 text-white/80 max-md:hidden md:mb-6" />}
              {title(true)}
              {subheading && !tail && <p className="ev-in mt-5 line-clamp-2 max-w-xl text-[15px] leading-relaxed text-white/75 max-md:hidden md:text-base" style={{ "--d": ".3s" } as React.CSSProperties}>{subheading}</p>}
              {whenRow(true, true)}
              {p.showCountdown && start && (
                <div className="ev-in mt-5 md:mt-7" style={{ "--d": ".45s" } as React.CSSProperties}>
                  <Countdown to={start.toISOString()} endsAt={end?.toISOString()} dark className="max-md:text-[13px] max-md:[&_.ev-num]:text-[1.75rem]" />
                </div>
              )}
              <div className="ev-in" style={{ "--d": ".55s" } as React.CSSProperties}>
                {ctas(true)}
              </div>
            </div>
          </div>
        </div>
      </section>
      <div id="after-hero" />
    </>
  );
}
