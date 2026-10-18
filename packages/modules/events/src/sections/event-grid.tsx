import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { eventGrid } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { EventCard } from "../components/event-card";
import { eventCardStats, listEvents, listPublicEvents } from "../services/catalog";
import { L } from "../labels";

type Props = z.output<typeof eventGrid.schema>;

/** Upcoming (or past) published events as cards with a date leaf and "from" price, or as a list of rows. */
export async function EventGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const { events, stats } = await withTenant(getDb(), tenantId, async (tx) => {
    const filter = { category: p.category || null, featuredOnly: p.featured, limit: p.limit };
    // past events keep status "published" or were marked "ended" by the organiser – both belong in the archive
    const events = p.scope === "past" ? await listEvents(tx, tenantId, { ...filter, scope: "past", status: ["published", "ended"] }) : await listPublicEvents(tx, tenantId, filter);
    return { events, stats: await eventCardStats(tx, tenantId, events.map((e) => e.id)) };
  });
  if (!events.length) return null;
  const viewAll = p.scope === "past" ? "/events?scope=past" : "/events";
  return (
    <Section id={id} tone={p.variant === "list" ? "surface" : "default"}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        {p.variant === "list" ? (
          <Stagger className="mx-auto grid max-w-5xl gap-4" stagger={0.06}>
            {events.map((e, i) => (
              <StaggerItem key={e.id}>
                <EventCard event={e} stats={stats.get(e.id)} variant="row" priority={i === 0} past={p.scope === "past"} />
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
            {events.map((e, i) => (
              <StaggerItem key={e.id} className="h-full">
                <EventCard event={e} stats={stats.get(e.id)} priority={i < 3} past={p.scope === "past"} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
        {p.showViewAll && (
          <Reveal className="mt-10 text-center">
            <Button asChild size="lg" variant="outline">
              <Link href={viewAll}>
                {L.allEvents} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Reveal>
        )}
      </div>
    </Section>
  );
}
