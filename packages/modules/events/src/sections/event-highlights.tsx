import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { cn } from "@rentweb/ui/lib/utils";
import { HorizontalScroll } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { eventHighlights } from "@rentweb/storefront/definitions";
import { CtaButton, Img, Section, SectionHeading, SectionStyles, StaggerCell, StaggerList } from "@rentweb/storefront";
import { EventCard } from "../components/event-card";
import { EvStyles } from "../components/ev-styles";
import { VelocitySkew } from "../components/velocity-skew";
import { listEvents } from "../services/catalog";
import { formatThaiDateRange } from "../services/time";
import { L } from "../labels";

type Props = z.output<typeof eventHighlights.schema>;

const p2 = (n: number) => String(n).padStart(2, "0");
const script = (s: string) => (/[฀-๿]/.test(s) ? "thai" : "latin");

interface Tile {
  key: string;
  image: string;
  alt: string;
  caption: string;
  meta: string;
  href?: string;
  shape: "tall" | "wide" | "square";
}

/**
 * Past highlights (§5.10): `filmstrip` = a pinned horizontal filmstrip (vertical scroll drives it on desktop, native
 * swipe on phones / reduced motion) whose frames lean with scroll velocity, mono captions under each frame; past events
 * link to their page. `grid` = an uneven mosaic.
 */
export async function EventHighlightsSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const past = p.limit > 0 ? await withTenant(getDb(), tenantId, (tx) => listEvents(tx, tenantId, { scope: "past", status: ["published", "ended"], limit: p.limit, order: "start_desc" })) : [];
  const shapes: Tile["shape"][] = ["tall", "wide", "square", "wide", "tall", "square"];
  const tiles: Tile[] = [];
  const imgs = p.images.filter((im) => im.url);
  // interleave: event poster, photo, photo, event poster …
  let ei = 0;
  let ii = 0;
  while (ei < past.length || ii < imgs.length) {
    if (ei < past.length) {
      const e = past[ei++]!;
      tiles.push({ key: e.id, image: e.cover ?? "", alt: e.title, caption: e.title, meta: [e.category, e.startsAt ? formatThaiDateRange(e.startsAt, e.endsAt) : ""].filter(Boolean).join(" · "), href: `/events/${encodeURIComponent(e.slug)}`, shape: "tall" });
    }
    for (let k = 0; k < 2 && ii < imgs.length; k++) {
      const im = imgs[ii++]!;
      tiles.push({ key: `img-${ii}`, image: im.url, alt: im.alt, caption: im.caption || im.alt, meta: "", shape: shapes[(tiles.length + 1) % shapes.length] === "tall" ? "square" : shapes[(tiles.length + 1) % shapes.length]! });
    }
  }
  if (!tiles.length) return null;
  const count = p2(tiles.length);

  if (p.layout === "grid") {
    return (
      <Section id={id} type="event-highlights" tone="surface" className="overflow-x-clip">
        <EvStyles />
        <div className="container-x">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" index={count} />
          <StaggerList className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" stagger={0.06}>
            {past.map((e, i) => (
              <StaggerCell key={e.id} className={cn("h-full", i === 0 && "col-span-2 row-span-2")}>
                <EventCard event={e} variant="compact" past className="h-full" />
              </StaggerCell>
            ))}
            {imgs.map((im, i) => (
              <StaggerCell key={`g-${i}`} className="h-full">
                <figure className="group relative h-full overflow-hidden rounded-[calc(var(--radius)*1.25)] bg-muted">
                  <Img src={im.url} alt={im.alt} className="aspect-[4/5] size-full object-cover grayscale-[.5] transition duration-700 group-hover:scale-105 group-hover:grayscale-0" />
                  {im.caption && <figcaption className="ev-mono absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 text-white/90" data-script={script(im.caption)}>{im.caption}</figcaption>}
                </figure>
              </StaggerCell>
            ))}
          </StaggerList>
          {past.length > 0 && (
            <div className="mt-10">
              <CtaButton href="/events?scope=past" label={L.past} variant="outline" size="lg" />
            </div>
          )}
        </div>
      </Section>
    );
  }

  const header = (
    <div className="container-x pb-8 md:pb-10">
      <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" index={count} className="!mb-0" />
    </div>
  );

  return (
    <div id={id} data-section="event-highlights" className="relative overflow-x-clip bg-surface pt-[calc(var(--section-y,7rem)*.6)] md:pt-0">
      <SectionStyles />
      <EvStyles />
      <VelocitySkew>
        <HorizontalScroll label={p.heading || L.past} header={header} trackClassName="items-end pb-2" className="md:[&_[data-hs-sticky]]:pt-[var(--header-h,80px)]">
          {tiles.map((t, i) => {
            const frame = (
              <>
                <div
                  className={cn(
                    "relative overflow-hidden rounded-[calc(var(--radius)*1.1)] bg-muted md:w-auto",
                    t.shape === "tall" ? "aspect-[4/5] w-[68vw] md:h-[min(50svh,520px)]" : t.shape === "wide" ? "aspect-[4/3] w-[80vw] md:h-[min(38svh,400px)]" : "aspect-square w-[68vw] md:h-[min(44svh,460px)]",
                  )}
                >
                  <Img src={t.image} alt={t.alt} className="size-full object-cover grayscale-[.55] transition duration-700 group-hover:scale-[1.04] group-hover:grayscale-0" sizes="(min-width: 768px) 40vw, 80vw" />
                  {t.href && <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />}
                  {t.href && (
                    <span className="ev-mono absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-white backdrop-blur" aria-hidden>
                      Past show
                    </span>
                  )}
                </div>
                <div className="mt-3 flex w-0 min-w-full items-baseline gap-3">
                  <span className="ev-mono shrink-0 text-muted-foreground">{p2(i + 1)}</span>
                  <span className="min-w-0">
                    <span className={cn("block truncate font-heading text-base font-semibold md:text-lg", t.href && "transition-colors group-hover:text-primary")} data-script={script(t.caption)}>
                      {t.caption}
                    </span>
                    {t.meta && <span className="block truncate text-xs text-muted-foreground">{t.meta}</span>}
                  </span>
                </div>
              </>
            );
            return t.href ? (
              <Link key={t.key} href={t.href} className="ev-skew group block shrink-0" data-cursor="view" data-cursor-label={L.viewEvent}>
                {frame}
              </Link>
            ) : (
              <figure key={t.key} className="ev-skew group m-0 block shrink-0">
                {frame}
              </figure>
            );
          })}
          <div className="flex w-[64vw] shrink-0 flex-col items-start justify-end gap-4 pb-16 md:w-[22rem]">
            <span className="ev-mono text-muted-foreground">End of reel</span>
            <p className="flex items-end gap-3">
              <span className="ev-num ev-ink text-[clamp(3.5rem,2.5rem+3vw,6rem)] font-bold">{count}</span>
              <span className="pb-2 text-sm text-muted-foreground">{L.gallery}</span>
            </p>
            {past.length > 0 && <CtaButton href="/events?scope=past" label={L.past} variant="outline" size="lg" />}
          </div>
        </HorizontalScroll>
      </VelocitySkew>
      <div className="h-[calc(var(--section-y,7rem)*.5)]" />
    </div>
  );
}
