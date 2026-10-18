import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { eventHighlights } from "@rentweb/storefront/definitions";
import { Img, Section, SectionHeading } from "@rentweb/storefront";
import { EventCard } from "../components/event-card";
import { listEvents } from "../services/catalog";
import { L } from "../labels";

type Props = z.output<typeof eventHighlights.schema>;

/**
 * Past highlights: the most recent ended events as poster tiles (cover + title + date) mixed with extra atmosphere
 * photos from the section props. Filmstrip = horizontal scroll-snap on phones, mosaic grid on desktop.
 */
export async function EventHighlightsSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const past = p.limit > 0 ? await withTenant(getDb(), tenantId, (tx) => listEvents(tx, tenantId, { scope: "past", status: ["published", "ended"], limit: p.limit, order: "start_desc" })) : [];
  const tiles: Array<{ key: string; node: React.ReactNode }> = [
    ...past.map((e) => ({ key: e.id, node: <EventCard event={e} variant="compact" past className="h-full" /> })),
    ...p.images
      .filter((im) => im.url)
      .map((im, i) => ({
        key: `img-${i}`,
        node: (
          <figure className="relative h-full overflow-hidden rounded-[var(--radius-xl)] bg-muted">
            <Img src={im.url} alt={im.alt} className="aspect-[4/5] size-full object-cover transition duration-700 hover:scale-105" />
            {im.caption && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-sm text-white">{im.caption}</figcaption>}
          </figure>
        ),
      })),
  ];
  if (!tiles.length) return null;

  return (
    <Section id={id} tone="surface" className="overflow-hidden">
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" />
        {p.layout === "grid" ? (
          <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" stagger={0.05}>
            {tiles.map((t, i) => (
              <StaggerItem key={t.key} className={cn("h-full", i === 0 && "col-span-2 row-span-2")}>
                {t.node}
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <Stagger className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden" stagger={0.05}>
            {tiles.map((t, i) => (
              <StaggerItem key={t.key} className={cn("w-[72vw] shrink-0 snap-start sm:w-[44vw] md:w-auto", i === 0 && "md:col-span-2 md:row-span-2")}>
                {t.node}
              </StaggerItem>
            ))}
          </Stagger>
        )}
        {past.length > 0 && (
          <Reveal className="mt-8">
            <Button asChild variant="outline" size="lg">
              <Link href="/events?scope=past">
                {L.past} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Reveal>
        )}
      </div>
    </Section>
  );
}
